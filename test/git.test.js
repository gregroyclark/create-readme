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

test("parseRemoteUrl normalizes local GitHub SSH aliases for public output", () => {
  assert.deepEqual(parseRemoteUrl("git@github.com-personal:gregroyclark/proverbdesk.git"), {
    host: "github.com",
    owner: "gregroyclark",
    repository: "proverbdesk",
    slug: "gregroyclark/proverbdesk",
    webUrl: "https://github.com/gregroyclark/proverbdesk",
    isGitHub: true,
  });
});

test("parseRemoteUrl does not expose unknown local SSH aliases as public URLs", () => {
  assert.deepEqual(parseRemoteUrl("git@company-git:team/private-repository.git"), {
    host: "company-git",
    owner: "team",
    repository: "private-repository",
    slug: "team/private-repository",
    webUrl: null,
    isGitHub: false,
  });
});

test("parseRemoteUrl does not rewrite GitHub Enterprise-style SSH aliases", () => {
  assert.deepEqual(parseRemoteUrl("git@github-enterprise:team/private-repository.git"), {
    host: "github-enterprise",
    owner: "team",
    repository: "private-repository",
    slug: "team/private-repository",
    webUrl: null,
    isGitHub: false,
  });
});

test("parseRemoteUrl rejects incomplete values", () => {
  assert.equal(parseRemoteUrl(null), null);
  assert.equal(parseRemoteUrl("not-a-remote"), null);
});
