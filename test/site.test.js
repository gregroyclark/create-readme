import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSiteFile = (path) => readFile(new URL(`../site/${path}`, import.meta.url), "utf8");

test("landing page describes the current product honestly", async () => {
  const html = await readSiteFile("index.html");

  assert.match(html, /Available in v2 beta/);
  assert.match(html, /Run the public beta/);
  assert.match(html, /npx @gregroyclark\/create-readme/);
  assert.match(html, /Studio[\s\S]+Planned/);
  assert.match(html, /GitHub Action[\s\S]+Planned/);
});

test("Pages static responses receive baseline security headers", async () => {
  const headers = await readSiteFile("_headers");

  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /X-Frame-Options: DENY/);
});
