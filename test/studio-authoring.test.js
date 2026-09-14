import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { startStudio } from "../src/studio/server.js";
import { inspectRepository } from "../src/core/inspect-repository.js";
import { createReadmeModel } from "../src/core/model.js";
import { renderReadme } from "../src/core/render-readme.js";

async function fixture(t, { config = {}, readme = "Handwritten README\n" } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "readme-studio-authoring-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "studio-fixture",
    description: "A fixture repository",
    scripts: { test: "node --test" },
    private: true,
  }));
  await writeFile(path.join(root, "README.md"), readme);
  await writeFile(path.join(root, "readme.config.json"), JSON.stringify(config));
  const studio = await startStudio({ root });
  t.after(() => studio.close());
  const url = new URL(studio.url);
  const headers = {
    Authorization: `Bearer ${url.hash.slice(1)}`,
    "Content-Type": "application/json",
  };
  const request = (route, init = {}) => fetch(`${url.origin}${route}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  return { root, url, request };
}

async function snapshot(fixture) {
  const response = await fixture.request("/api/studio");
  assert.equal(response.status, 200);
  return response.json();
}

function writeRequest(snapshot, kind, overrides, extra = {}) {
  const target = snapshot.targets[kind === "config" ? "config" : "readme"];
  return {
    overrides,
    expectedRevision: target.revision,
    confirm: true,
    reviewId: snapshot.reviewId,
    ...extra,
  };
}

test("Studio authoring draft uses the shared model and exposes evidence metadata", async t => {
  const config = { title: "Saved title", unknownChoice: { keep: true } };
  const app = await fixture(t, { config });
  const initial = await snapshot(app);
  assert.deepEqual(initial.overrides, config);
  assert.ok(initial.defaults && initial.model);
  assert.deepEqual(initial.sectionIds, initial.sectionIds.filter(id => typeof id === "string"));
  assert.ok(Array.isArray(initial.badgeCandidates));
  assert.ok(Array.isArray(initial.badgeStyles));
  assert.equal(initial.targets.readme.path, "README.md");
  assert.equal(initial.targets.config.path, "readme.config.json");
  assert.equal(initial.targets.readme.exists, true);
  assert.equal(initial.targets.config.exists, true);
  assert.equal(typeof initial.targets.readme.revision, "string");
  assert.equal(typeof initial.targets.config.revision, "string");
  assert.equal(typeof initial.reviewId, "string");

  const overrides = { ...config, title: "Draft title", description: "Draft description", features: ["One feature"] };
  const response = await app.request("/api/preview", { method: "POST", body: JSON.stringify({ overrides }) });
  assert.equal(response.status, 200);
  const draft = await response.json();
  const facts = await inspectRepository({ root: app.root });
  assert.equal(draft.markdown, renderReadme(createReadmeModel(facts, overrides)));
  assert.equal(draft.overrides.unknownChoice.keep, true);
  assert.equal((await readFile(path.join(app.root, "README.md"), "utf8")), "Handwritten README\n");
});

test("Studio saves explicit config choices, including unknown fields, without pinning detections", async t => {
  const app = await fixture(t, { config: { unknownChoice: "preserve" } });
  const before = await snapshot(app);
  const overrides = { ...before.overrides, title: "Round-tripped", unknownChoice: "updated" };
  const preview = await app.request("/api/preview", { method: "POST", body: JSON.stringify({ overrides }) });
  assert.equal(preview.status, 200);
  const reviewed = await preview.json();
  const response = await app.request("/api/save-config", { method: "POST", body: JSON.stringify(writeRequest(reviewed, "config", overrides)) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.saved.kind, "config");
  assert.equal(result.saved.path, "readme.config.json");
  assert.deepEqual(JSON.parse(await readFile(path.join(app.root, "readme.config.json"))), overrides);
  assert.equal(Object.hasOwn(JSON.parse(await readFile(path.join(app.root, "readme.config.json"))), "packageManager"), false);
});

test("Studio writes the reviewed README draft as the complete generated document", async t => {
  const app = await fixture(t, { readme: "" });
  const overrides = { title: "Written draft", description: "A reviewed draft", sections: ["installation"] };
  const previewResponse = await app.request("/api/preview", { method: "POST", body: JSON.stringify({ overrides }) });
  const draft = await previewResponse.json();
  const response = await app.request("/api/write-readme", { method: "POST", body: JSON.stringify(writeRequest(draft, "readme", overrides)) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.saved.kind, "readme");
  assert.equal(result.saved.path, "README.md");
  assert.equal(await readFile(path.join(app.root, "README.md"), "utf8"), draft.markdown);
});

test("Studio requires bearer authorization, confirmation, and review identity for writes", async t => {
  const app = await fixture(t);
  const current = await snapshot(app);
  const body = writeRequest(current, "config", { title: "Nope" });
  const noAuth = await fetch(`${app.url.origin}/api/save-config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(noAuth.status, 403);
  const noConfirm = await app.request("/api/save-config", { method: "POST", body: JSON.stringify({ ...body, confirm: false }) });
  assert.equal(noConfirm.status, 400);
  const noReview = await app.request("/api/save-config", { method: "POST", body: JSON.stringify({ ...body, reviewId: undefined }) });
  assert.ok([400, 409].includes(noReview.status));
});

test("Studio refuses stale README and config writes and preserves handwritten bytes", async t => {
  const app = await fixture(t, { config: { title: "Initial" }, readme: "Handwritten bytes\n" });
  const current = await snapshot(app);
  await writeFile(path.join(app.root, "README.md"), "Changed by someone else\n");
  const readmeResult = await app.request("/api/write-readme", { method: "POST", body: JSON.stringify(writeRequest(current, "readme", current.overrides)) });
  assert.equal(readmeResult.status, 409);
  assert.equal(await readFile(path.join(app.root, "README.md"), "utf8"), "Changed by someone else\n");

  await writeFile(path.join(app.root, "readme.config.json"), JSON.stringify({ title: "Changed externally" }));
  const configResult = await app.request("/api/save-config", { method: "POST", body: JSON.stringify(writeRequest(current, "config", current.overrides)) });
  assert.equal(configResult.status, 409);
  assert.deepEqual(JSON.parse(await readFile(path.join(app.root, "readme.config.json"))), { title: "Changed externally" });
});

test("Studio rejects malformed, oversized, invalid, changed-repository, and unsafe target requests", async t => {
  const app = await fixture(t);
  const current = await snapshot(app);
  const malformed = await app.request("/api/preview", { method: "POST", body: "{" });
  assert.equal(malformed.status, 400);
  const oversized = await app.request("/api/preview", { method: "POST", body: JSON.stringify({ overrides: { description: "x".repeat(2_000_000) } }) });
  assert.equal(oversized.status, 413);
  const invalid = await app.request("/api/preview", { method: "POST", body: JSON.stringify({ overrides: { title: "", sections: [] } }) });
  assert.equal(invalid.status, 200);
  const invalidDraft = await invalid.json();
  assert.ok(invalidDraft.errors.length > 0);
  const invalidWrite = await app.request("/api/write-readme", { method: "POST", body: JSON.stringify(writeRequest(invalidDraft, "readme", { title: "", sections: [] })) });
  assert.equal(invalidWrite.status, 422);

  await writeFile(path.join(app.root, "package.json"), JSON.stringify({ name: "changed", description: "Changed" }));
  const changed = await app.request("/api/save-config", { method: "POST", body: JSON.stringify(writeRequest(current, "config", current.overrides)) });
  assert.equal(changed.status, 409);

  const outside = `${app.root}-outside-config.json`;
  t.after(() => rm(outside, { force: true }));
  await writeFile(outside, "{}");
  await assert.rejects(() => startStudio({ root: app.root, configPath: "../outside-config.json" }), /path|root|target|outside|unsafe/i);
  await symlink(outside, path.join(app.root, "linked-config.json"));
  await assert.rejects(() => startStudio({ root: app.root, configPath: "linked-config.json" }), /path|root|target|outside|symlink|unsafe/i);
});
