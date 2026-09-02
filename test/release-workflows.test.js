import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const release = (
  await readFile(new URL(".github/workflows/release.yml", root), "utf8")
).replaceAll("\r\n", "\n");
const publish = (
  await readFile(new URL(".github/workflows/publish.yml", root), "utf8")
).replaceAll("\r\n", "\n");
const checkout = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const setupNode = "820762786026740c76f36085b0efc47a31fe5020";

test("release coordinator is manual-only and never publishes to npm", () => {
  assert.match(release, /workflow_dispatch:/);
  assert.doesNotMatch(
    release,
    /repository_dispatch:|id-token:\s*write|environment:\s*npm|npm publish/,
  );
  assert.match(release, /git push --atomic/);
  assert.match(release, /event_type: "npm-release"/);
  assert.match(release, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(release, new RegExp("actions/checkout@" + checkout));
  assert.match(release, new RegExp("actions/setup-node@" + setupNode));
});

test("publisher accepts only the release dispatch and confines OIDC to publishing", () => {
  assert.match(publish, /repository_dispatch:\n\s+types: \[npm-release\]/);
  assert.doesNotMatch(publish, /workflow_dispatch:|workflow_call:/);
  assert.doesNotMatch(publish, /recover-existing:/);
  assert.match(
    publish,
    /validate-and-pack:[\s\S]*?permissions:\n\s+contents: read/,
  );
  assert.match(
    publish,
    /publish:[\s\S]*?environment: npm[\s\S]*?id-token: write/,
  );
  assert.match(
    publish,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/,
  );
  assert.match(
    publish,
    /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/,
  );
  assert.match(publish, /artifact-ids:/);
  assert.match(publish, /npm pack --json --ignore-scripts/);
  assert.match(
    publish,
    /npm publish "\.\/\$FILENAME" --ignore-scripts --access public --tag "\$NPM_TAG" --provenance --registry=https:\/\/registry\.npmjs\.org/,
  );
  assert.match(publish, /npm audit signatures --json --include-attestations/);
  assert.match(
    publish,
    /npm install --ignore-scripts --save-exact --registry=https:\/\/registry\.npmjs\.org "\$PACKAGE_NAME@\$VERSION"/,
  );
  assert.doesNotMatch(publish, /package-lock=false|--no-save/);
  assert.match(publish, /if \[ "\$RUN_ATTEMPT" -eq 1 \]/);
  assert.match(
    publish,
    /Recovered an already-published package from an earlier attempt/,
  );
  assert.equal(
    (publish.match(/package-manager-cache: false/g) ?? []).length,
    3,
  );
  assert.doesNotMatch(publish, /cache: npm/);
  assert.doesNotMatch(
    publish,
    /NPM_TOKEN|npm dist-tag|npm unpublish|gh release|site:deploy/,
  );
});
