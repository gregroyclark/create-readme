import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";

export const BADGE_STYLES = ["flat", "flat-square", "for-the-badge", "plastic", "social"];
export const MAX_JSON_BYTES = 256 * 1024;
export const MAX_TARGET_BYTES = 2 * 1024 * 1024;

const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const KNOWN_OVERRIDE_KEYS = new Set([
  "title", "description", "features", "sections", "badges", "badgeStyle", "demoPath",
  "installCommand", "usageCommand", "commands", "architecture", "projectStructure", "testing",
  "deployment", "technologies", "languages", "license", "contributingFile", "author",
]);

export class StudioRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function rejectPrototypeKeys(value, depth = 0) {
  if (depth > 40) throw new StudioRequestError(400, "Configuration nesting is too deep.");
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) rejectPrototypeKeys(item, depth + 1);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (PROTOTYPE_KEYS.has(key)) throw new StudioRequestError(400, `Unsupported key: ${key}`);
    rejectPrototypeKeys(item, depth + 1);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, key, { nullable = false } = {}) {
  if (typeof value !== "string" && !(nullable && value === null)) {
    throw new StudioRequestError(400, `${key} must be ${nullable ? "a string or null" : "a string"}.`);
  }
}

function assertStringArray(value, key) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new StudioRequestError(400, `${key} must be an array of strings.`);
  }
}

function assertEntries(value, key, fields) {
  if (!Array.isArray(value) || value.some((entry) => !isObject(entry) || fields.some((field) => typeof entry[field] !== "string"))) {
    throw new StudioRequestError(400, `${key} has an invalid entry.`);
  }
}

// Unknown top-level fields deliberately remain valid: the configuration format is forward compatible.
export function validateOverrides(value) {
  if (!isObject(value)) throw new StudioRequestError(400, "overrides must be an object.");
  rejectPrototypeKeys(value);

  for (const key of Object.keys(value)) {
    if (!KNOWN_OVERRIDE_KEYS.has(key)) continue;
    const entry = value[key];
    switch (key) {
      case "title": case "description": case "contributingFile":
        assertString(entry, key); break;
      case "installCommand": case "usageCommand":
        assertString(entry, key, { nullable: true }); break;
      case "demoPath": case "license": case "author":
        assertString(entry, key, { nullable: true }); break;
      case "features": case "sections": case "badges": case "languages":
        assertStringArray(entry, key); break;
      case "badgeStyle":
        assertString(entry, key);
        if (!BADGE_STYLES.includes(entry)) throw new StudioRequestError(400, "badgeStyle is not supported.");
        break;
      case "commands":
        assertEntries(entry, key, ["id", "command", "description"]); break;
      case "projectStructure":
        assertEntries(entry, key, ["path", "description"]); break;
      case "technologies":
        if (!Array.isArray(entry) || entry.some((item) => typeof item !== "string" && (!isObject(item) || typeof item.name !== "string" || typeof item.category !== "string"))) {
          throw new StudioRequestError(400, "technologies has an invalid entry.");
        }
        break;
      case "architecture":
        if (entry !== null && typeof entry !== "string" && (!isObject(entry) || typeof entry.summary !== "string" || (entry.evidence !== undefined && (!Array.isArray(entry.evidence) || entry.evidence.some((item) => typeof item !== "string"))))) {
          throw new StudioRequestError(400, "architecture must be a string, null, or an object with a summary.");
        }
        break;
      case "testing":
        if (entry !== null && (!isObject(entry) || (entry.commands !== undefined && (!Array.isArray(entry.commands) || entry.commands.some((item) => !isObject(item) || ["id", "command", "description"].some((field) => typeof item[field] !== "string")))))) {
          throw new StudioRequestError(400, "testing must be null or an object with command entries.");
        }
        break;
      case "deployment":
        if (entry !== null && (!isObject(entry) || ["provider", "configFile", "publishDirectory"].some((field) => entry[field] !== undefined && typeof entry[field] !== "string"))) {
          throw new StudioRequestError(400, "deployment must be null or an object with string fields.");
        }
        break;
    }
  }
  return value;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function assertSafePath(root, target, { allowMissingTarget = true } = {}) {
  if (!isInside(root, target)) throw new StudioRequestError(403, "Studio target must remain inside the launched repository.");
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new StudioRequestError(403, "Studio does not follow symbolic links for write targets.");
      if (index < parts.length - 1 && !stat.isDirectory()) throw new StudioRequestError(403, "Studio target has an invalid parent directory.");
      if (index === parts.length - 1 && !stat.isFile()) throw new StudioRequestError(403, "Studio target must be a regular file.");
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissingTarget) return;
      throw error;
    }
  }
}

export async function resolveStudioTargets(root, configPath) {
  const resolvedRoot = await (async () => {
    try { return await (await import("node:fs/promises")).realpath(path.resolve(root)); }
    catch (error) { throw new StudioRequestError(403, `Could not use Studio root: ${error.message}`); }
  })();
  const config = path.resolve(resolvedRoot, configPath);
  const readme = path.join(resolvedRoot, "README.md");
  const relativeConfig = path.relative(resolvedRoot, config);
  if (config === resolvedRoot || config === readme) {
    throw new StudioRequestError(403, "Studio config must be a separate file inside the launched repository.");
  }
  if (relativeConfig.split(path.sep)[0] === ".git") {
    throw new StudioRequestError(403, "Studio does not write configuration inside .git.");
  }
  await assertSafePath(resolvedRoot, config);
  await assertSafePath(resolvedRoot, readme);
  return {
    root: resolvedRoot,
    config: { path: config, displayPath: path.relative(resolvedRoot, config) || path.basename(config) },
    readme: { path: readme, displayPath: "README.md" },
  };
}

function fingerprint(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function readStudioTarget(root, target) {
  await assertSafePath(root, target.path);
  try {
    const targetStat = await lstat(target.path);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new StudioRequestError(403, "Studio target must be a regular file.");
    }
    if (targetStat.size > MAX_TARGET_BYTES) {
      throw new StudioRequestError(413, `${target.displayPath} is too large for Studio (maximum ${MAX_TARGET_BYTES} bytes).`);
    }
    const bytes = await readFile(target.path);
    return { path: target.displayPath, exists: true, content: bytes.toString("utf8"), revision: fingerprint(bytes) };
  } catch (error) {
    if (error?.code === "ENOENT") return { path: target.displayPath, exists: false, content: "", revision: "missing" };
    throw error;
  }
}

export async function readStudioConfig(root, target) {
  const file = await readStudioTarget(root, target);
  if (!file.exists) return { ...file, overrides: {} };
  try {
    const overrides = JSON.parse(file.content);
    validateOverrides(overrides);
    return { ...file, overrides };
  } catch (error) {
    if (error instanceof StudioRequestError) throw error;
    throw new Error(`Could not parse ${file.path}: ${error.message}`);
  }
}

export async function writeStudioTarget(root, target, expectedRevision, content) {
  if (typeof expectedRevision !== "string") throw new StudioRequestError(400, "expectedRevision must be a string.");
  await assertSafePath(root, target.path);
  const parent = path.dirname(target.path);
  await mkdir(parent, { recursive: true });
  await assertSafePath(root, target.path);
  if (await realpath(parent) !== parent) {
    throw new StudioRequestError(403, "Studio does not follow symbolic-link parent directories for write targets.");
  }
  const current = await readStudioTarget(root, target);
  if (current.revision !== expectedRevision) throw new StudioRequestError(409, `${target.displayPath} changed since it was reviewed.`);
  const existingStat = current.exists ? await lstat(target.path) : null;
  if (existingStat && (existingStat.isSymbolicLink() || !existingStat.isFile())) {
    throw new StudioRequestError(403, "Studio target changed while saving.");
  }
  const existingMode = existingStat ? existingStat.mode & 0o777 : null;

  const staged = path.join(parent, `.${path.basename(target.path)}.${randomUUID()}.tmp`);
  try {
    const handle = await open(staged, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (existingMode !== null) await chmod(staged, existingMode);
    // The fingerprint check is intentionally adjacent to rename, while writes are serialized by the server.
    const immediatelyBeforeRename = await readStudioTarget(root, target);
    if (immediatelyBeforeRename.revision !== expectedRevision) {
      throw new StudioRequestError(409, `${target.displayPath} changed while saving.`);
    }
    await assertSafePath(root, target.path);
    if (await realpath(parent) !== parent) {
      throw new StudioRequestError(403, "Studio target parent changed while saving.");
    }
    await rename(staged, target.path);
    return { revision: fingerprint(content) };
  } catch (error) {
    await unlink(staged).catch(() => {});
    throw error;
  }
}

export function configText(overrides) {
  return `${JSON.stringify(overrides, null, 2)}\n`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

export function digest(value) {
  return fingerprint(stableJson(value));
}
