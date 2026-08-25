import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertDispatchPayload,
  assertDownloadedArtifact,
  assertNpmTagPolicy,
  assertPackageLockAgreement,
  assertPackedArtifact,
  assertPackedPackage,
  assertRegistryAbsent,
  assertRegistryDistTag,
  assertRegistryVersion,
  assertSafePackFilename,
  assertVerifiedNpmProvenance,
  assertVersionIncrease,
  compareCanonicalSemver,
  deriveReleaseTag,
  parseCanonicalSemver,
  parseNpmPackResult,
  parseSha512Integrity,
} from "../.github/scripts/release-helpers.mjs";

const bytes = Buffer.alloc(64, 7);
const digest = createHash("sha512").update(bytes).digest("hex");
const integrity = "sha512-" + Buffer.from(digest, "hex").toString("base64");

test("parseCanonicalSemver accepts canonical stable and prerelease versions", () => {
  assert.deepEqual(parseCanonicalSemver("2.0.0-beta.3"), {
    version: "2.0.0-beta.3",
    major: "2",
    minor: "0",
    patch: "0",
    prerelease: ["beta", "3"],
  });
  assert.deepEqual(parseCanonicalSemver("24.13.1"), {
    version: "24.13.1",
    major: "24",
    minor: "13",
    patch: "1",
    prerelease: [],
  });
});

test("parseCanonicalSemver rejects noncanonical versions", () => {
  for (const version of [
    "v2.0.0",
    "2.0",
    "02.0.0",
    "2.0.0-beta.03",
    "2.0.0+build.1",
    " 2.0.0",
    "2.0.0-",
  ]) {
    assert.throws(() => parseCanonicalSemver(version), /canonical SemVer/);
  }
});

test("compareCanonicalSemver follows stable and prerelease precedence", () => {
  assert.equal(compareCanonicalSemver("2.0.0-beta.9", "2.0.0-beta.10"), -1);
  assert.equal(compareCanonicalSemver("2.0.0-beta.1", "2.0.0-beta.alpha"), -1);
  assert.equal(compareCanonicalSemver("2.0.0-beta", "2.0.0"), -1);
  assert.equal(compareCanonicalSemver("2.0.0", "2.0.0"), 0);
  assert.equal(compareCanonicalSemver("2.1.0", "2.0.9"), 1);
  assert.equal(
    compareCanonicalSemver("9007199254740993.0.0", "9007199254740992.0.0"),
    1,
  );
  assert.equal(
    compareCanonicalSemver(
      "2.0.0-beta.9007199254740993",
      "2.0.0-beta.9007199254740992",
    ),
    1,
  );
});

test("release versions must increase and derive v-prefixed tags", () => {
  assert.equal(
    assertVersionIncrease("2.0.0-beta.3", "2.0.0-beta.4"),
    "2.0.0-beta.4",
  );
  assert.throws(
    () => assertVersionIncrease("2.0.0", "2.0.0"),
    /must be greater/,
  );
  assert.throws(
    () => assertVersionIncrease("2.0.0", "1.9.9"),
    /must be greater/,
  );
  assert.equal(deriveReleaseTag("2.0.0-beta.4"), "v2.0.0-beta.4");
});

test("prereleases use beta and stable releases use latest", () => {
  assert.equal(assertNpmTagPolicy("2.0.0-beta.4", "beta"), "beta");
  assert.equal(assertNpmTagPolicy("2.0.0", "latest"), "latest");
  assert.throws(
    () => assertNpmTagPolicy("2.0.0-beta.4", "latest"),
    /must use npm tag beta/,
  );
  assert.throws(
    () => assertNpmTagPolicy("2.0.0", "beta"),
    /must use npm tag latest/,
  );
});

test("package manifest and lock root must agree", () => {
  const manifest = { name: "@example/package", version: "2.0.0" };
  const lock = {
    name: "@example/package",
    version: "2.0.0",
    packages: { "": { name: "@example/package", version: "2.0.0" } },
  };
  assert.deepEqual(assertPackageLockAgreement(manifest, lock), manifest);
  assert.throws(
    () =>
      assertPackageLockAgreement(manifest, {
        name: "@example/package",
        version: "2.0.1",
        packages: { "": { name: "@example/package", version: "2.0.1" } },
      }),
    /must agree/,
  );
  assert.throws(
    () => assertPackageLockAgreement(manifest, { ...lock, version: "2.0.1" }),
    /must agree/,
  );
});

test("npm pack output must be one valid package with expected metadata", () => {
  const packJson = JSON.stringify([
    {
      filename: "example-package-2.0.0.tgz",
      integrity,
      name: "@example/package",
      version: "2.0.0",
    },
  ]);
  assert.deepEqual(parseNpmPackResult(packJson), {
    filename: "example-package-2.0.0.tgz",
    integrity,
    name: "@example/package",
    version: "2.0.0",
  });
  assert.equal(
    assertPackedPackage(packJson, {
      name: "@example/package",
      version: "2.0.0",
    }).integrity,
    integrity,
  );
  assert.throws(() => parseNpmPackResult("not json"), /valid JSON/);
  assert.throws(() => parseNpmPackResult("[]"), /exactly one/);
  assert.throws(
    () =>
      assertPackedPackage(packJson, {
        name: "@example/package",
        version: "2.0.1",
      }),
    /must match/,
  );
});

test("registry metadata must match package integrity and selected dist-tag", () => {
  const metadata = {
    name: "@example/package",
    version: "2.0.0",
    dist: { integrity },
  };
  assert.equal(
    assertRegistryVersion(metadata, {
      name: "@example/package",
      version: "2.0.0",
      integrity,
    }),
    metadata,
  );
  assert.throws(
    () =>
      assertRegistryVersion(metadata, {
        name: "@example/package",
        version: "2.0.0",
        integrity: "sha512-" + Buffer.alloc(64, 8).toString("base64"),
      }),
    /integrity/,
  );
  assert.deepEqual(
    assertRegistryDistTag({ latest: "2.0.0" }, "latest", "2.0.0"),
    { latest: "2.0.0" },
  );
  assert.throws(
    () =>
      assertRegistryDistTag({ beta: "2.0.0-beta.1" }, "beta", "2.0.0-beta.2"),
    /must point/,
  );
});

test("pack artifacts require a safe filename and matching canonical SHA-512", async () => {
  for (const filename of [
    "../escape.tgz",
    "nested/file.tgz",
    "file.tar",
    "bad\n.tgz",
  ]) {
    assert.throws(() => assertSafePackFilename(filename), /safe basename/);
  }
  assert.equal(parseSha512Integrity(integrity).hex, digest);
  assert.throws(() => parseSha512Integrity("sha512-not-base64"), /canonical/);
  const directory = await mkdtemp(path.join(tmpdir(), "release-helper-"));
  try {
    const filename = "example-package-2.0.0.tgz";
    await writeFile(path.join(directory, filename), bytes);
    const pack = JSON.stringify([
      { filename, integrity, name: "@example/package", version: "2.0.0" },
    ]);
    const packed = await assertPackedArtifact(
      pack,
      { name: "@example/package", version: "2.0.0" },
      directory,
    );
    assert.equal(packed.sha512, digest);
    await assertDownloadedArtifact(directory, filename, integrity, digest);
    await writeFile(path.join(directory, filename), Buffer.alloc(64, 9));
    await assert.rejects(
      assertDownloadedArtifact(directory, filename, integrity, digest),
      /does not match/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("only explicit npm E404 establishes package absence", () => {
  assert.equal(
    assertRegistryAbsent("npm error code E404\nnpm error 404 Not Found"),
    true,
  );
  for (const output of [
    "npm error code E401",
    "npm error code E404\nnpm error code E401",
    "E404 in a package description",
    "network timeout",
  ]) {
    assert.throws(() => assertRegistryAbsent(output), /explicitly report E404/);
  }
});

test("dispatch payload is the exact create-readme release contract", () => {
  const payload = {
    package_name: "@gregroyclark/create-readme",
    version: "2.0.0-beta.4",
    npm_tag: "beta",
    release_tag: "v2.0.0-beta.4",
    release_sha: "a".repeat(40),
    coordinator_run_id: "42",
    coordinator_run_attempt: "1",
  };
  assert.deepEqual(assertDispatchPayload(payload), payload);
  assert.throws(
    () => assertDispatchPayload({ ...payload, package_name: "@other/package" }),
    /package_name/,
  );
  assert.throws(
    () => assertDispatchPayload({ ...payload, unexpected: "field" }),
    /exactly/,
  );
});

function provenanceFixture() {
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [
      {
        name: "pkg:npm/%40gregroyclark/create-readme@2.0.0",
        digest: { sha512: digest },
      },
    ],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        buildType:
          "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: {
          workflow: {
            repository: "https://github.com/gregroyclark/create-readme",
            path: ".github/workflows/publish.yml",
            ref: "refs/heads/master",
          },
        },
        internalParameters: { github: { event_name: "repository_dispatch" } },
        resolvedDependencies: [
          {
            uri: "git+https://github.com/gregroyclark/create-readme@refs/heads/master",
            digest: { gitCommit: "a".repeat(40) },
          },
        ],
      },
      runDetails: {
        builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: {
          invocationId:
            "https://github.com/gregroyclark/create-readme/actions/runs/42/attempts/1",
        },
      },
    },
  };
  return {
    invalid: [],
    missing: [],
    verified: [
      {
        name: "@gregroyclark/create-readme",
        version: "2.0.0",
        registry: "https://registry.npmjs.org/",
        attestations: {
          url: "https://registry.npmjs.org/-/npm/v1/attestations/%40gregroyclark%2fcreate-readme@2.0.0",
          provenance: { predicateType: "https://slsa.dev/provenance/v1" },
          publish: {
            predicateType:
              "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
          },
        },
        attestationBundles: [
          {
            predicateType: "https://slsa.dev/provenance/v1",
            bundle: {
              dsseEnvelope: {
                payloadType: "application/vnd.in-toto+json",
                payload: Buffer.from(JSON.stringify(statement)).toString(
                  "base64",
                ),
                signatures: [{ sig: "verified-by-npm" }],
              },
            },
          },
          {
            predicateType:
              "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
            bundle: {
              dsseEnvelope: {
                payloadType: "application/vnd.in-toto+json",
                payload: "ignored",
                signatures: [{ sig: "verified-by-npm" }],
              },
            },
          },
        ],
      },
    ],
  };
}
const provenanceIdentity = {
  package_name: "@gregroyclark/create-readme",
  version: "2.0.0",
  integrity,
  release_sha: "a".repeat(40),
  repository: "gregroyclark/create-readme",
  run_id: "42",
  run_attempt: "2",
};
function provenanceEnvelope(audit) {
  return audit.verified[0].attestationBundles[0].bundle.dsseEnvelope;
}
test("verified npm audit provenance binds the package and this publisher run", () => {
  assert.doesNotThrow(() =>
    assertVerifiedNpmProvenance(provenanceFixture(), provenanceIdentity),
  );
  const otherRun = provenanceFixture();
  const envelope = provenanceEnvelope(otherRun);
  const statement = JSON.parse(Buffer.from(envelope.payload, "base64"));
  statement.predicate.runDetails.metadata.invocationId =
    "https://github.com/gregroyclark/create-readme/actions/runs/43/attempts/1";
  envelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
  assert.throws(
    () => assertVerifiedNpmProvenance(otherRun, provenanceIdentity),
    /publisher workflow run/,
  );
  assert.throws(
    () =>
      assertVerifiedNpmProvenance(
        { invalid: [], missing: [], verified: [] },
        provenanceIdentity,
      ),
    /cryptographically verified/,
  );
});

test("verified provenance rejects every trusted-publisher identity mismatch", () => {
  const mutations = [
    (statement) => {
      statement.subject[0].digest.sha512 = "0".repeat(128);
    },
    (statement) => {
      statement.predicate.buildDefinition.buildType = "other";
    },
    (statement) => {
      statement.predicate.buildDefinition.externalParameters.workflow.repository =
        "https://github.com/other/repository";
    },
    (statement) => {
      statement.predicate.buildDefinition.externalParameters.workflow.path =
        ".github/workflows/other.yml";
    },
    (statement) => {
      statement.predicate.buildDefinition.externalParameters.workflow.ref =
        "refs/heads/other";
    },
    (statement) => {
      statement.predicate.buildDefinition.internalParameters.github.event_name =
        "push";
    },
    (statement) => {
      statement.predicate.buildDefinition.resolvedDependencies[0].uri =
        "git+https://github.com/gregroyclark/create-readme@refs/heads/other";
    },
    (statement) => {
      statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit =
        "b".repeat(40);
    },
    (statement) => {
      statement.predicate.runDetails.builder.id =
        "https://example.invalid/runner";
    },
  ];
  for (const mutate of mutations) {
    const audit = provenanceFixture();
    const envelope = provenanceEnvelope(audit);
    const statement = JSON.parse(Buffer.from(envelope.payload, "base64"));
    mutate(statement);
    envelope.payload = Buffer.from(JSON.stringify(statement)).toString(
      "base64",
    );
    assert.throws(() => assertVerifiedNpmProvenance(audit, provenanceIdentity));
  }
  const duplicate = provenanceFixture();
  duplicate.verified[0].attestationBundles.push(
    structuredClone(duplicate.verified[0].attestationBundles[0]),
  );
  assert.throws(
    () => assertVerifiedNpmProvenance(duplicate, provenanceIdentity),
    /exactly one/,
  );
  assert.throws(() => {
    const audit = provenanceFixture();
    provenanceEnvelope(audit).payload = "not-base64";
    return assertVerifiedNpmProvenance(audit, provenanceIdentity);
  }, /canonical base64/);
  const wrongRegistry = provenanceFixture();
  wrongRegistry.verified[0].registry = "https://registry.example.invalid/";
  assert.throws(
    () => assertVerifiedNpmProvenance(wrongRegistry, provenanceIdentity),
    /public npm registry/,
  );
  const invalidAudit = provenanceFixture();
  invalidAudit.invalid.push({ name: "@gregroyclark/create-readme" });
  assert.throws(
    () => assertVerifiedNpmProvenance(invalidAudit, provenanceIdentity),
    /invalid packages/,
  );
  const futureAttempt = provenanceFixture();
  const futureEnvelope = provenanceEnvelope(futureAttempt);
  const futureStatement = JSON.parse(
    Buffer.from(futureEnvelope.payload, "base64"),
  );
  futureStatement.predicate.runDetails.metadata.invocationId =
    "https://github.com/gregroyclark/create-readme/actions/runs/42/attempts/3";
  futureEnvelope.payload = Buffer.from(
    JSON.stringify(futureStatement),
  ).toString("base64");
  assert.throws(
    () => assertVerifiedNpmProvenance(futureAttempt, provenanceIdentity),
    /earlier or current attempt/,
  );
});
