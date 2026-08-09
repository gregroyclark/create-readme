import assert from "node:assert/strict";
import test from "node:test";

import { createReadmeModel } from "../src/core/model.js";
import { renderReadme } from "../src/core/render-readme.js";

function facts(overrides = {}) {
  return {
    title: "create-readme",
    description: "Generate a better README.",
    packageName: "@example/create-readme",
    private: false,
    runtime: ">=22",
    languages: [{ name: "JavaScript", fileCount: 4 }],
    demoPath: "assets/demo.gif",
    contributingFile: null,
    license: "MIT",
    licenseFile: "LICENSE",
    licenseConflict: false,
    installCommand: "npx @example/create-readme",
    usageCommand: "npx @example/create-readme",
    developmentCommand: "npm install",
    testCommand: "npm test",
    packageManager: "npm",
    owner: "example",
    repository: "create-readme",
    repositoryUrl: "https://github.com/example/create-readme",
    remote: { isGitHub: true, slug: "example/create-readme" },
    workflowFile: null,
    branch: "feature",
    defaultBranch: "main",
    filesScanned: 10,
    scanTruncated: false,
    ...overrides,
  };
}

test("createReadmeModel applies overrides without discarding detected facts", () => {
  const model = createReadmeModel(facts(), {
    description: "A focused README generator.",
    sections: ["installation", "license"],
    badges: ["license", "node"],
  });

  assert.equal(model.description, "A focused README generator.");
  assert.deepEqual(model.sections, ["installation", "license"]);
  assert.deepEqual(model.languages, ["JavaScript"]);
  assert.equal(model.badges.length, 2);
});

test("renderReadme emits clean GitHub-flavored Markdown", () => {
  const markdown = renderReadme(
    createReadmeModel(facts(), {
      sections: ["demo", "installation", "usage", "technology", "contributing", "license", "author"],
      badges: ["license"],
    }),
  );

  assert.match(markdown, /^# create-readme\n/);
  assert.match(markdown, /## Installation\n\n```bash\nnpx @example\/create-readme\n```/);
  assert.match(markdown, /https:\/\/img\.shields\.io\/github\/license\/example\/create-readme/);
  assert.match(markdown, /blob\/main\/LICENSE/);
  assert.doesNotMatch(markdown, /<h[1-6]/i);
  assert.equal(markdown.endsWith("\n"), true);
});

test("createReadmeModel warns when package metadata has no license file", () => {
  const model = createReadmeModel(facts({ licenseFile: null }));
  assert.deepEqual(model.warnings, ["The package declares MIT, but no LICENSE file was detected."]);
});
