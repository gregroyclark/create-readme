import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { startStudio } from "../src/studio/server.js";
import { renderStudioPreview } from "../src/studio/data.js";
import { inspectRepository } from "../src/core/inspect-repository.js";
import { createReadmeModel } from "../src/core/model.js";
import { renderReadme } from "../src/core/render-readme.js";

test("Studio serves the shared output, rescans configuration, and never writes the repository", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "readme-studio-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", description: "Example repository", private: true }));
  await writeFile(path.join(root, "README.md"), "Existing document\n");
  const config = { title: "My project", description: "Configured description" };
  await writeFile(path.join(root, "readme.config.json"), JSON.stringify(config));
  const before = await readdir(root);
  const studio = await startStudio({ root });
  t.after(() => studio.close());
  const url = new URL(studio.url);
  assert.equal(studio.server.address().address, "127.0.0.1");
  const headers = { Authorization: `Bearer ${url.hash.slice(1)}` };
  const response = await fetch(`${url.origin}/api/studio`, { headers });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /img-src 'none'/);
  const snapshot = await response.json();
  const expected = renderReadme(createReadmeModel(await inspectRepository({ root }), config));
  assert.equal(snapshot.markdown, expected);
  assert.match(snapshot.html, /<h1>My project<\/h1>/);
  assert.equal(snapshot.config, "readme.config.json");
  for (const route of ["/", "/app.js", "/style.css"]) assert.equal((await fetch(url.origin + route)).status, 200);
  assert.equal((await fetch(`${url.origin}/api/studio`)).status, 403);
  assert.equal((await fetch(`${url.origin}/api/studio`, { headers: { ...headers, Origin: "https://example.com" } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    http.get(`${url.origin}/api/studio`, { headers: { ...headers, Host: "evil.example" } }, response => {
      response.resume(); resolve(response.statusCode);
    }).on("error", reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch(`${url.origin}/api/studio`, { method: "POST", headers })).status, 405);
  for (const route of ["/package.json", "/README.md", "/../package.json", "/%2e%2e/package.json"]) assert.equal((await fetch(url.origin + route)).status, 404);
  assert.equal(await (await fetch(`${url.origin}/`, { method: "HEAD" })).text(), "");
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"), "Existing document\n");
  assert.deepEqual(await readdir(root), before);
  await writeFile(path.join(root, "readme.config.json"), JSON.stringify({ ...config, title: "Updated project" }));
  assert.match((await (await fetch(`${url.origin}/api/studio`, { headers })).json()).markdown, /^# Updated project/);
  await writeFile(path.join(root, "readme.config.json"), "invalid json");
  const failed = await fetch(`${url.origin}/api/studio`, { headers });
  assert.equal(failed.status, 500);
  assert.match((await failed.json()).error, /Could not parse/);
});

test("Studio renders tables and code without executing HTML or loading media", () => {
  const result = renderStudioPreview('# Preview\n\n<script>alert(1)</script>\n\n![image](https://example.com/tracker.png)\n\n[unsafe](javascript:alert(1))\n\n[local](../../secret)\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```js\n<x>\n```');
  assert.doesNotMatch(result, /<script|<img|href="javascript:|href="\.\./);
  assert.match(result, /&lt;script&gt;/);
  assert.match(result, /<table>/);
  assert.match(result, /&lt;x&gt;/);
});
