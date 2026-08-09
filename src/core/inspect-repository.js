import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { inspectGit } from "./git.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const LANGUAGE_BY_EXTENSION = new Map([
  [".c", "C"],
  [".cc", "C++"],
  [".cpp", "C++"],
  [".cs", "C#"],
  [".css", "CSS"],
  [".dart", "Dart"],
  [".ex", "Elixir"],
  [".exs", "Elixir"],
  [".go", "Go"],
  [".html", "HTML"],
  [".java", "Java"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".kt", "Kotlin"],
  [".kts", "Kotlin"],
  [".lua", "Lua"],
  [".mjs", "JavaScript"],
  [".php", "PHP"],
  [".py", "Python"],
  [".rb", "Ruby"],
  [".rs", "Rust"],
  [".scss", "Sass"],
  [".sh", "Shell"],
  [".swift", "Swift"],
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".vue", "Vue"],
]);

const DEMO_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const DEMO_WORDS = /(demo|preview|screenshot|screen|walkthrough)/i;
const MAX_FILES = 5_000;

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function listFiles(root) {
  const files = [];
  const directories = [""];

  while (directories.length > 0 && files.length < MAX_FILES) {
    const relativeDirectory = directories.pop();
    const absoluteDirectory = path.join(root, relativeDirectory);
    let entries;

    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      const relativePath = path.join(relativeDirectory, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) {
          directories.push(relativePath);
        } else if (relativePath === ".github") {
          directories.push(relativePath);
        }
      } else if (entry.isFile()) {
        files.push(relativePath.split(path.sep).join("/"));
      }
    }
  }

  return files;
}

function detectPackageManager(files, packageJson) {
  const declared = packageJson?.packageManager?.split("@")[0];
  if (["npm", "pnpm", "yarn", "bun"].includes(declared)) return declared;
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lock") || files.includes("bun.lockb")) return "bun";
  return "npm";
}

function detectLanguages(files) {
  const counts = new Map();

  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION.get(path.extname(file).toLowerCase());
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, fileCount]) => ({ name, fileCount }));
}

function detectDemoPath(files) {
  return (
    files
      .filter((file) => DEMO_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .sort((left, right) => {
        const score = (file) =>
          (file.startsWith("assets/") ? 4 : 0) +
          (DEMO_WORDS.test(path.basename(file)) ? 3 : 0) +
          (path.extname(file).toLowerCase() === ".gif" ? 1 : 0);
        return score(right) - score(left) || left.localeCompare(right);
      })[0] ?? null
  );
}

function detectLicenseFromText(text) {
  const samples = [
    [/MIT License/i, "MIT"],
    [/Apache License[\s\S]{0,80}Version 2\.0/i, "Apache-2.0"],
    [/GNU (?:AFFERO )?GENERAL PUBLIC LICENSE[\s\S]{0,100}Version 3/i, "GPL-3.0"],
    [/Mozilla Public License[\s\S]{0,80}2\.0/i, "MPL-2.0"],
    [/ISC License/i, "ISC"],
    [/BSD 3-Clause/i, "BSD-3-Clause"],
  ];
  return samples.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

async function inspectLicense(root, files, packageJson) {
  const licenseFile = files.find((file) => /^licen[cs]e(?:\.[^/]+)?$/i.test(file)) ?? null;
  let fileLicense = null;

  if (licenseFile) {
    try {
      fileLicense = detectLicenseFromText((await readFile(path.join(root, licenseFile), "utf8")).slice(0, 8_000));
    } catch {
      fileLicense = null;
    }
  }

  const packageLicense =
    typeof packageJson?.license === "string" && packageJson.license.toUpperCase() !== "UNLICENSED"
      ? packageJson.license
      : null;

  return {
    license: fileLicense ?? packageLicense,
    licenseFile,
    licenseSource: fileLicense ? licenseFile : packageLicense ? "package.json" : null,
    licenseConflict: Boolean(fileLicense && packageLicense && fileLicense !== packageLicense),
  };
}

function defaultInstallCommand(packageManager, packageJson) {
  if (packageJson?.bin && packageJson?.name && !packageJson.private) {
    return `npx ${packageJson.name}`;
  }
  return `${packageManager} install`;
}

function defaultUsageCommand(packageManager, packageJson) {
  if (packageJson?.bin && packageJson?.name) return `npx ${packageJson.name}`;
  if (packageJson?.scripts?.start) return `${packageManager} start`;
  if (packageJson?.scripts?.dev) return `${packageManager} run dev`;
  return null;
}

export async function inspectRepository(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const files = await listFiles(root);
  const packageJson = await readJson(path.join(root, "package.json"));
  const git = await inspectGit(root, options.remoteUrl);
  const packageManager = detectPackageManager(files, packageJson);
  const license = await inspectLicense(root, files, packageJson);
  const contributingFile =
    files.find((file) => /^contributing(?:\.[^/]+)?$/i.test(path.basename(file))) ?? null;
  const workflowFile =
    files.find((file) => /^\.github\/workflows\/.+\.ya?ml$/i.test(file)) ?? null;
  const repositoryName = git.remote?.repository ?? path.basename(root);
  const packageTitle = packageJson?.name?.split("/").at(-1);

  return {
    root,
    filesScanned: files.length,
    scanTruncated: files.length >= MAX_FILES,
    title: packageJson?.displayName ?? packageTitle ?? repositoryName,
    description: packageJson?.description ?? "",
    packageName: packageJson?.name ?? null,
    packageVersion: packageJson?.version ?? null,
    private: Boolean(packageJson?.private),
    packageManager,
    developmentCommand: `${packageManager} install`,
    installCommand: defaultInstallCommand(packageManager, packageJson),
    usageCommand: defaultUsageCommand(packageManager, packageJson),
    testCommand: packageJson?.scripts?.test ? `${packageManager} test` : null,
    runtime: packageJson?.engines?.node ?? null,
    scripts: packageJson?.scripts ?? {},
    binName:
      typeof packageJson?.bin === "string"
        ? packageJson.name
        : Object.keys(packageJson?.bin ?? {})[0] ?? null,
    languages: detectLanguages(files),
    demoPath: detectDemoPath(files),
    contributingFile,
    workflowFile,
    branch: git.branch,
    defaultBranch: git.defaultBranch,
    remoteUrl: git.remoteUrl,
    remote: git.remote,
    owner: git.remote?.owner ?? null,
    repository: repositoryName,
    repositoryUrl: git.remote?.webUrl ?? null,
    ...license,
  };
}
