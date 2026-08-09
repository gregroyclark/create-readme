import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectRepository } from "../src/core/inspect-repository.js";

test("inspectRepository detects useful local and Git metadata", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-inspect-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "assets"));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/fixture",
      version: "1.0.0",
      description: "Fixture project",
      license: "MIT",
      bin: { fixture: "bin.js" },
      engines: { node: ">=22" },
      scripts: { test: "node --test" },
    }),
  );
  await writeFile(path.join(root, "package-lock.json"), "{}");
  await writeFile(path.join(root, "src", "index.ts"), "export const value = true;\n");
  await writeFile(path.join(root, "src", "legacy.js"), "module.exports = {};\n");
  await writeFile(path.join(root, "assets", "demo.gif"), "GIF89a");
  await writeFile(path.join(root, "LICENSE"), "MIT License\n\nPermission is hereby granted...");

  const facts = await inspectRepository({
    root,
    remoteUrl: "git@github.com:example/fixture.git",
  });

  assert.equal(facts.title, "fixture");
  assert.equal(facts.description, "Fixture project");
  assert.equal(facts.packageManager, "npm");
  assert.equal(facts.installCommand, "npx @example/fixture");
  assert.equal(facts.runtime, ">=22");
  assert.equal(facts.license, "MIT");
  assert.equal(facts.licenseFile, "LICENSE");
  assert.equal(facts.demoPath, "assets/demo.gif");
  assert.equal(facts.remote.slug, "example/fixture");
  assert.deepEqual(
    facts.languages.map((language) => language.name),
    ["JavaScript", "TypeScript"],
  );
});

test("inspectRepository prefers the license file when package metadata conflicts", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-license-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", license: "ISC" }));
  await writeFile(path.join(root, "LICENSE"), "MIT License\n");

  const facts = await inspectRepository({ root });
  assert.equal(facts.license, "MIT");
  assert.equal(facts.licenseConflict, true);
});
