import assert from "node:assert/strict";
import test from "node:test";

import { parseRemoteUrl } from "../src/core/git.js";

test("parseRemoteUrl handles HTTPS GitHub remotes", () => {
  assert.deepEqual(parseRemoteUrl("https://github.com/gregroyclark/create-readme.git"), {
    host: "github.com",
    owner: "gregroyclark",
    repository: "create-readme",
    slug: "gregroyclark/create-readme",
    webUrl: "https://github.com/gregroyclark/create-readme",
    isGitHub: true,
  });
});

test("parseRemoteUrl handles SSH remotes and nested owners", () => {
  assert.deepEqual(parseRemoteUrl("git@gitlab.com:team/docs/create-readme.git"), {
    host: "gitlab.com",
    owner: "team/docs",
    repository: "create-readme",
    slug: "team/docs/create-readme",
    webUrl: "https://gitlab.com/team/docs/create-readme",
    isGitHub: false,
  });
});

test("parseRemoteUrl rejects incomplete values", () => {
  assert.equal(parseRemoteUrl(null), null);
  assert.equal(parseRemoteUrl("not-a-remote"), null);
});
