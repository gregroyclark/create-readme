import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const sri = /^sha512-([A-Za-z0-9+/]{86}==)$/;
const sha = /^[a-f0-9]{40}$/;
const hex512 = /^[a-f0-9]{128}$/;
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const buildType =
  "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1";
const provenancePredicateType = "https://slsa.dev/provenance/v1";
const registryOrigin = "https://registry.npmjs.org";
const trustedPackageName = "@gregroyclark/create-readme";
const fail = (message) => {
  throw new Error(message);
};
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(label + " must be an object.");
  return value;
}
function string(value, label) {
  if (typeof value !== "string" || !value)
    fail(label + " must be a non-empty string.");
  return value;
}
function scalar(value, label) {
  const result = string(value, label);
  if (/[^\x21-\x7e]/.test(result))
    fail(label + " contains unsafe whitespace or control characters.");
  return result;
}
function gitSha(value, label) {
  const result = string(value, label);
  if (!sha.test(result))
    fail(label + " must be a lowercase 40-character Git SHA.");
  return result;
}
function compareNumbers(left, right) {
  return left.length !== right.length
    ? left.length < right.length
      ? -1
      : 1
    : left === right
      ? 0
      : left < right
        ? -1
        : 1;
}

export function parseCanonicalSemver(version) {
  if (typeof version !== "string") fail("Version must be a string.");
  const match = semver.exec(version);
  if (!match)
    fail(
      "Version must be canonical SemVer without a leading v or build metadata: " +
        version,
    );
  return {
    version,
    major: match[1],
    minor: match[2],
    patch: match[3],
    prerelease: match[4] ? match[4].split(".") : [],
  };
}
export function compareCanonicalSemver(left, right) {
  const a = parseCanonicalSemver(left);
  const b = parseCanonicalSemver(right);
  for (const key of ["major", "minor", "patch"])
    if (a[key] !== b[key]) return compareNumbers(a[key], b[key]);
  if (!a.prerelease.length || !b.prerelease.length)
    return a.prerelease.length === b.prerelease.length
      ? 0
      : !a.prerelease.length
        ? 1
        : -1;
  for (
    let i = 0;
    i < Math.max(a.prerelease.length, b.prerelease.length);
    i += 1
  ) {
    const x = a.prerelease[i],
      y = b.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x),
      yn = /^\d+$/.test(y);
    if (xn && yn) return compareNumbers(x, y);
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
export function assertVersionIncrease(current, requested) {
  parseCanonicalSemver(current);
  parseCanonicalSemver(requested);
  if (compareCanonicalSemver(requested, current) <= 0)
    fail(
      "Requested version " +
        requested +
        " must be greater than current version " +
        current +
        ".",
    );
  return requested;
}
export function deriveReleaseTag(version) {
  parseCanonicalSemver(version);
  return "v" + version;
}
export function assertNpmTagPolicy(version, tag) {
  const parsed = parseCanonicalSemver(version);
  if (!["beta", "latest"].includes(tag))
    fail("npm tag must be beta or latest, received " + tag + ".");
  const expected = parsed.prerelease.length ? "beta" : "latest";
  if (tag !== expected)
    fail(
      (parsed.prerelease.length ? "Prerelease" : "Stable") +
        " version " +
        version +
        " must use npm tag " +
        expected +
        ".",
    );
  return tag;
}
export function assertPackageLockAgreement(manifest, lock) {
  object(manifest, "package.json");
  object(lock, "package-lock.json");
  const root = object(lock.packages?.[""], "package-lock.json packages root");
  const name = string(manifest.name, "package.json name"),
    version = string(manifest.version, "package.json version");
  if (
    lock.name !== name ||
    lock.version !== version ||
    root.name !== name ||
    root.version !== version
  )
    fail("package.json and package-lock.json root name/version must agree.");
  return { name, version };
}
export function assertSafePackFilename(filename) {
  const value = string(filename, "npm pack filename");
  if (
    value !== path.basename(value) ||
    !value.endsWith(".tgz") ||
    /[\\/\x00-\x1f\x7f]/.test(value)
  )
    fail("npm pack filename must be a safe basename ending in .tgz.");
  return value;
}
export function parseSha512Integrity(integrity) {
  const value = string(integrity, "SHA-512 integrity"),
    match = sri.exec(value);
  if (!match) fail("SHA-512 integrity must be canonical sha512 base64 SRI.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== match[1])
    fail("SHA-512 integrity must be canonical base64.");
  return { integrity: value, hex: bytes.toString("hex") };
}
export function parseNpmPackResult(text) {
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    fail("npm pack output must be valid JSON.");
  }
  if (!Array.isArray(result) || result.length !== 1)
    fail("npm pack output must contain exactly one package result.");
  const packed = object(result[0], "npm pack package result");
  return {
    filename: assertSafePackFilename(packed.filename),
    integrity: parseSha512Integrity(packed.integrity).integrity,
    name: string(packed.name, "npm pack name"),
    version: string(packed.version, "npm pack version"),
  };
}
export function assertPackedPackage(text, expected) {
  const packed = parseNpmPackResult(text);
  if (packed.name !== expected.name || packed.version !== expected.version)
    fail(
      "npm pack result must match " +
        expected.name +
        "@" +
        expected.version +
        ".",
    );
  return packed;
}
export async function sha512FileHex(filePath) {
  const hash = createHash("sha512");
  await new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", resolve);
    input.on("error", reject);
  });
  return hash.digest("hex");
}
export async function assertPackedArtifact(text, expected, directory = ".") {
  const packed = assertPackedPackage(text, expected),
    integrity = parseSha512Integrity(packed.integrity),
    root = path.resolve(directory),
    tarball = path.resolve(root, packed.filename);
  if (path.dirname(tarball) !== root)
    fail("Packed tarball escapes the requested directory.");
  const digest = await sha512FileHex(tarball);
  if (digest !== integrity.hex)
    fail("Packed tarball SHA-512 does not match npm pack integrity.");
  return { ...packed, sha512: digest };
}
export async function assertDownloadedArtifact(
  directory,
  filename,
  integrity,
  expectedDigest,
) {
  const safe = assertSafePackFilename(filename),
    parsed = parseSha512Integrity(integrity);
  if (!hex512.test(string(expectedDigest, "Expected SHA-512")))
    fail("Expected SHA-512 must be lowercase hexadecimal.");
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isFile() || entries[0].name !== safe)
    fail("Downloaded artifact must contain exactly the expected tarball.");
  const root = path.resolve(directory),
    tarball = path.resolve(root, safe);
  if (path.dirname(tarball) !== root || !(await stat(tarball)).isFile())
    fail("Downloaded artifact path is unsafe.");
  const actual = await sha512FileHex(tarball);
  if (actual !== expectedDigest || actual !== parsed.hex)
    fail("Downloaded artifact SHA-512 does not match validated metadata.");
  return tarball;
}
export function assertArtifactId(value) {
  const id = string(value, "Artifact ID");
  if (!/^[1-9]\d*$/.test(id))
    fail("Artifact ID must be a positive decimal integer.");
  return id;
}
export function assertRunAttempt(value) {
  const attempt = String(value);
  if (!/^[1-9]\d*$/.test(attempt))
    fail("GitHub run attempt must be a positive decimal integer.");
  return Number(attempt);
}
export function assertRegistryVersion(metadata, expected) {
  object(metadata, "Registry metadata");
  if (metadata.name !== expected.name || metadata.version !== expected.version)
    fail(
      "Registry metadata must match " +
        expected.name +
        "@" +
        expected.version +
        ".",
    );
  if (metadata.dist?.integrity !== expected.integrity)
    fail("Registry integrity does not match the packed package integrity.");
  return metadata;
}
export function assertRegistryDistTag(tags, tag, version) {
  object(tags, "Registry dist-tags");
  if (tags[tag] !== version)
    fail("Registry dist-tag " + tag + " must point to " + version + ".");
  return tags;
}
export function assertRegistryAbsent(text) {
  const output = string(text, "npm view error output");
  const codes = [
    ...output.matchAll(
      /(?:^|\n)(?:npm ERR! |npm error )?code (E[A-Z0-9]+)(?:\s|$)/gm,
    ),
  ].map((match) => match[1]);
  if (codes.length !== 1 || codes[0] !== "E404")
    fail("npm view did not explicitly report E404 absence.");
  return true;
}
function npmName(value, label) {
  const name = scalar(value, label);
  if (!packageName.test(name)) fail(label + " is not a safe npm package name.");
  return name;
}
export function assertDispatchPayload(payload) {
  const value = object(payload, "repository_dispatch client_payload"),
    name = npmName(value.package_name, "Dispatch package_name"),
    version = parseCanonicalSemver(value.version).version,
    tag = assertNpmTagPolicy(version, value.npm_tag),
    releaseTag = scalar(value.release_tag, "Dispatch release_tag"),
    releaseSha = gitSha(value.release_sha, "Dispatch release_sha"),
    runId = scalar(
      String(value.coordinator_run_id),
      "Dispatch coordinator_run_id",
    ),
    attempt = scalar(
      String(value.coordinator_run_attempt),
      "Dispatch coordinator_run_attempt",
    );
  const expectedKeys = [
    "coordinator_run_attempt",
    "coordinator_run_id",
    "npm_tag",
    "package_name",
    "release_sha",
    "release_tag",
    "version",
  ];
  if (Object.keys(value).sort().join("\n") !== expectedKeys.join("\n"))
    fail("Dispatch payload must contain exactly the release contract fields.");
  if (name !== trustedPackageName)
    fail("Dispatch package_name must be " + trustedPackageName + ".");
  if (releaseTag !== deriveReleaseTag(version))
    fail("Dispatch release_tag does not match version.");
  if (!/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(attempt))
    fail(
      "Dispatch coordinator run identity must be positive decimal integers.",
    );
  return {
    package_name: name,
    version,
    npm_tag: tag,
    release_tag: releaseTag,
    release_sha: releaseSha,
    coordinator_run_id: runId,
    coordinator_run_attempt: attempt,
  };
}
export function assertReleaseMetadata(manifest, lock, payload) {
  const metadata = assertPackageLockAgreement(manifest, lock),
    request = assertDispatchPayload(payload);
  if (
    metadata.name !== request.package_name ||
    metadata.version !== request.version
  )
    fail("Release package metadata does not match the dispatch payload.");
  return { ...metadata, ...request };
}
function decodeBase64Json(value, label) {
  const encoded = string(value, label);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
    fail(label + " is not canonical base64.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded)
    fail(label + " is not canonical base64.");
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(label + " does not decode to JSON.");
  }
}
function purl(name, version) {
  return (
    "pkg:npm/" + encodeURIComponent(name).replace(/%2F/g, "/") + "@" + version
  );
}
function exactRegistryUrl(value, label, expectedPath = "/") {
  let url;
  try {
    url = new URL(string(value, label));
  } catch {
    fail(label + " must be a valid URL.");
  }
  if (
    url.origin !== registryOrigin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (expectedPath !== null && url.pathname !== expectedPath)
  ) {
    fail(label + " must use the public npm registry.");
  }
  return url;
}
function verifiedProvenanceStatement(audit, name, version) {
  const result = object(audit, "npm audit signatures output");
  for (const field of ["invalid", "missing"]) {
    if (!Array.isArray(result[field]) || result[field].length !== 0) {
      fail("npm audit signatures output contains " + field + " packages.");
    }
  }
  if (!Array.isArray(result.verified) || !result.verified.length) {
    fail(
      "npm audit signatures output has no cryptographically verified packages.",
    );
  }
  const entries = result.verified.filter(
    (entry) => entry?.name === name && entry?.version === version,
  );
  if (entries.length !== 1) {
    fail(
      "npm audit signatures output must contain exactly one verified entry for " +
        name +
        "@" +
        version +
        ".",
    );
  }
  const entry = object(entries[0], "Verified audit entry");
  exactRegistryUrl(entry.registry, "Verified package registry");
  const attestations = object(
    entry.attestations,
    "Verified package attestations",
  );
  const attestationUrl = exactRegistryUrl(
    attestations.url,
    "Verified attestation URL",
    null,
  );
  if (!attestationUrl.pathname.startsWith("/-/npm/v1/attestations/")) {
    fail("Verified attestation URL must use npm's attestation endpoint.");
  }
  const provenance = object(
    attestations.provenance,
    "Verified provenance reference",
  );
  if (provenance.predicateType !== provenancePredicateType) {
    fail("Verified provenance reference is not SLSA v1.");
  }
  if (!Array.isArray(entry.attestationBundles)) {
    fail("Verified package attestation bundles must be an array.");
  }
  const provenanceBundles = entry.attestationBundles.filter(
    (item) => item?.predicateType === provenancePredicateType,
  );
  if (provenanceBundles.length !== 1) {
    fail(
      "Expected exactly one cryptographically verified SLSA provenance bundle, found " +
        provenanceBundles.length +
        ".",
    );
  }
  const bundleEntry = object(
    provenanceBundles[0],
    "Verified provenance bundle entry",
  );
  const bundle = object(bundleEntry.bundle, "Verified provenance bundle");
  const envelope = object(bundle.dsseEnvelope, "Verified DSSE envelope");
  if (
    envelope.payloadType !== "application/vnd.in-toto+json" ||
    !Array.isArray(envelope.signatures) ||
    envelope.signatures.length === 0
  ) {
    fail("Verified DSSE envelope is malformed.");
  }
  for (const signature of envelope.signatures) {
    string(
      object(signature, "Verified DSSE signature").sig,
      "Verified DSSE signature value",
    );
  }
  return decodeBase64Json(envelope.payload, "Verified DSSE payload");
}
export function assertVerifiedNpmProvenance(audit, identity) {
  const expected = object(identity, "Expected provenance identity"),
    name = npmName(expected.package_name, "Expected package_name"),
    version = parseCanonicalSemver(expected.version).version,
    integrity = parseSha512Integrity(expected.integrity),
    releaseSha = gitSha(expected.release_sha, "Expected release_sha"),
    runId = String(expected.run_id),
    runAttempt = assertRunAttempt(expected.run_attempt);
  if (
    name !== trustedPackageName ||
    expected.repository !== "gregroyclark/create-readme" ||
    !/^[1-9]\d*$/.test(runId)
  )
    fail("Expected trusted publisher identity is invalid.");
  const statement = object(
    verifiedProvenanceStatement(audit, name, version),
    "SLSA statement",
  );
  if (
    statement._type !== "https://in-toto.io/Statement/v1" ||
    statement.predicateType !== provenancePredicateType
  ) {
    fail("Provenance statement is not SLSA v1.");
  }
  const subjects = statement.subject;
  if (
    !Array.isArray(subjects) ||
    subjects.length !== 1 ||
    subjects[0]?.name !== purl(name, version) ||
    subjects[0]?.digest?.sha512 !== integrity.hex
  ) {
    fail("Provenance must contain exactly one matching package subject.");
  }
  const predicate = object(statement.predicate, "SLSA predicate");
  const definition = object(predicate.buildDefinition, "SLSA buildDefinition");
  const externalParameters = object(
    definition.externalParameters,
    "SLSA externalParameters",
  );
  const workflow = object(
    externalParameters.workflow,
    "SLSA workflow identity",
  );
  const internalParameters = object(
    definition.internalParameters,
    "SLSA internalParameters",
  );
  const github = object(
    internalParameters.github,
    "SLSA GitHub invocation parameters",
  );
  if (
    definition.buildType !== buildType ||
    workflow.repository !== "https://github.com/gregroyclark/create-readme" ||
    workflow.path !== ".github/workflows/publish.yml" ||
    workflow.ref !== "refs/heads/master" ||
    github.event_name !== "repository_dispatch"
  ) {
    fail("Provenance workflow identity does not match the trusted publisher.");
  }
  const dependencies = definition.resolvedDependencies;
  if (
    !Array.isArray(dependencies) ||
    dependencies.length !== 1 ||
    dependencies[0]?.uri !==
      "git+https://github.com/gregroyclark/create-readme@refs/heads/master" ||
    dependencies[0]?.digest?.gitCommit !== releaseSha
  ) {
    fail(
      "Provenance resolved dependency does not bind the release commit and branch.",
    );
  }
  const run = object(predicate.runDetails, "SLSA runDetails");
  if (run.builder?.id !== "https://github.com/actions/runner/github-hosted") {
    fail("Provenance builder is not a GitHub-hosted runner.");
  }
  const invocation = string(
    run.metadata?.invocationId,
    "Provenance invocation ID",
  );
  const match = new RegExp(
    "^https://github\\.com/gregroyclark/create-readme/actions/runs/" +
      runId +
      "/attempts/([1-9]\\d*)$",
  ).exec(invocation);
  if (!match || compareNumbers(match[1], String(runAttempt)) > 0) {
    fail(
      "Provenance invocation is not an earlier or current attempt of this publisher workflow run.",
    );
  }
  return statement;
}
async function json(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    fail("Could not read JSON from " + filePath + ": " + error.message);
  }
}
async function main(args) {
  const [command, ...rest] = args;
  switch (command) {
    case "validate-release-input":
      parseCanonicalSemver(rest[0]);
      assertNpmTagPolicy(rest[0], rest[1]);
      process.stdout.write(deriveReleaseTag(rest[0]) + "\n");
      return;
    case "assert-version-increase":
      assertVersionIncrease(rest[0], rest[1]);
      return;
    case "assert-package-lock":
      assertPackageLockAgreement(await json(rest[0]), await json(rest[1]));
      return;
    case "assert-packed-package":
      process.stdout.write(
        assertPackedPackage(await readFile(rest[0], "utf8"), {
          name: rest[1],
          version: rest[2],
        }).integrity + "\n",
      );
      return;
    case "assert-packed-artifact":
      process.stdout.write(
        JSON.stringify(
          await assertPackedArtifact(
            await readFile(rest[0], "utf8"),
            { name: rest[1], version: rest[2] },
            rest[3],
          ),
        ) + "\n",
      );
      return;
    case "assert-downloaded-artifact":
      process.stdout.write((await assertDownloadedArtifact(...rest)) + "\n");
      return;
    case "assert-artifact-id":
      process.stdout.write(assertArtifactId(rest[0]) + "\n");
      return;
    case "assert-run-attempt":
      process.stdout.write(String(assertRunAttempt(rest[0])) + "\n");
      return;
    case "assert-registry-version":
      assertRegistryVersion(await json(rest[0]), {
        name: rest[1],
        version: rest[2],
        integrity: rest[3],
      });
      return;
    case "assert-registry-dist-tag":
      assertRegistryDistTag(await json(rest[0]), rest[1], rest[2]);
      return;
    case "assert-registry-absent":
      assertRegistryAbsent(await readFile(rest[0], "utf8"));
      return;
    case "assert-dispatch-payload":
      process.stdout.write(
        JSON.stringify(
          assertDispatchPayload((await json(rest[0])).client_payload),
        ) + "\n",
      );
      return;
    case "assert-release-metadata": {
      const payload = await json(rest[2]);
      process.stdout.write(
        JSON.stringify(
          assertReleaseMetadata(
            await json(rest[0]),
            await json(rest[1]),
            payload.client_payload ?? payload,
          ),
        ) + "\n",
      );
      return;
    }
    case "assert-verified-provenance":
      assertVerifiedNpmProvenance(await json(rest[0]), await json(rest[1]));
      return;
    default:
      fail("Unknown release helper command: " + (command ?? "(none)") + ".");
  }
}
if (import.meta.url === "file://" + process.argv[1])
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
