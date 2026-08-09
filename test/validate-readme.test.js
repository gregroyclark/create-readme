import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { validateReadme } from "../src/core/validate-readme.js";

test("validateReadme accepts one H1 and existing local images", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-validate-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "demo.png"), "image");

  const result = await validateReadme("# Project\n\n![Demo](demo.png)\n", { root });
  assert.deepEqual(result, { valid: true, errors: [], warnings: [] });
});

test("validateReadme reports structural errors and placeholders", async () => {
  const result = await validateReadme("## TODO\n");
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /exactly one level-one heading/);
  assert.match(result.warnings[0], /Placeholder/);
});

test("validateReadme ignores examples and historical names inside code", async () => {
  const result = await validateReadme("# Project\n\nThe old output was `PASTEME.md`.\n\n```md\n## TODO\n```\n");
  assert.deepEqual(result, { valid: true, errors: [], warnings: [] });
});

test("validateReadme warns about missing local images", async () => {
  const result = await validateReadme("# Project\n\n![Demo](missing.png)\n");
  assert.deepEqual(result.warnings, ["Local image not found: missing.png"]);
});
