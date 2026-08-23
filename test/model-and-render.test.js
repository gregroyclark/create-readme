import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { inspectRepository } from "../src/core/inspect-repository.js";
import { configFromModel, createReadmeModel } from "../src/core/model.js";
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

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function createEvidenceApplication(context) {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-render-app-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directories = [
    "public",
    "src/components",
    "src/layouts",
    "src/lib",
    "src/pages",
    "src/react-pages",
  ];
  await Promise.all(directories.map((directory) => mkdir(path.join(root, directory), { recursive: true })));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "render-app",
      private: true,
      description: "An evidence-backed application.",
      scripts: {
        dev: "astro dev",
        start: "astro dev --host 0.0.0.0 --port 5000",
        build: "astro build",
        preview: "astro preview --port 8888",
        check: "astro check",
        "test:e2e": "cypress run",
        format: "prettier --write .",
      },
      dependencies: {
        "@astrojs/react": "^4.0.0",
        astro: "^5.0.0",
        react: "^19.0.0",
      },
      devDependencies: { cypress: "^14.0.0" },
    }),
  );
  await writeFile(
    path.join(root, "astro.config.ts"),
    'import react from "@astrojs/react";\nimport { defineConfig } from "astro/config";\n\nexport default defineConfig({ integrations: [react()] });\n',
  );
  await writeFile(path.join(root, "netlify.toml"), '[build]\n  publish = "dist"\n');
  await writeFile(
    path.join(root, "src/pages/index.astro"),
    '---\nimport Cart from "../react-pages/cart.jsx";\n---\n\n<Cart client:load />\n',
  );
  await writeFile(path.join(root, "src/react-pages/cart.jsx"), "export default function Cart() { return null; }\n");
  await writeFile(path.join(root, "src/components/CartButton.jsx"), "export default function CartButton() { return null; }\n");
  await writeFile(path.join(root, "src/layouts/Layout.astro"), "<slot />\n");
  await writeFile(path.join(root, "src/lib/paths.json"), "{}\n");
  await writeFile(path.join(root, "public/favicon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" />\n');
  return root;
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

test("private packages retain package-oriented default sections", () => {
  const model = createReadmeModel(
    facts({
      private: true,
      projectType: "package",
      packageAuthor: "Package Maintainer",
      commands: [{ id: "build", command: "npm run build", description: "Create a build" }],
      technologies: [],
    }),
  );

  assert.equal(model.sections.includes("installation"), true);
  assert.equal(model.sections.includes("usage"), true);
  assert.equal(model.sections.includes("commands"), false);
  assert.equal(model.sections.includes("author"), false);
});

test("application defaults render evidence-backed README sections", async (context) => {
  const root = await createEvidenceApplication(context);
  const model = createReadmeModel(await inspectRepository({ root }));
  const markdown = renderReadme(model);

  assert.deepEqual(model.sections, [
    "commands",
    "architecture",
    "project-structure",
    "testing",
    "deployment",
    "technology",
  ]);
  assert.match(markdown, /## Commands\n\n\| Command \| Description \|\n\| --- \| --- \|\n\| `npm install` \| Install dependencies \|\n\| `npm run dev` \| Start the development server \|/);
  assert.doesNotMatch(markdown, /npm start/);
  assert.match(markdown, /\| `npm run preview` \| Preview the production build on port 8888 \|/);
  assert.match(markdown, /\| `npm run test:e2e` \| Run end-to-end tests \|[\s\S]*\| `npm run format` \| Format the codebase \|/);
  assert.match(markdown, /## Architecture\n\nAstro owns file-based routing, page documents, and the production build, while React powers interactive components through the Astro React integration\./);
  assert.doesNotMatch(markdown, /Detected from/);
  assert.match(markdown, /## Project structure\n\n\| Path \| Purpose \|/);
  assert.match(markdown, /\| `src\/components` \| Reusable UI components \|/);
  assert.match(markdown, /## Testing[\s\S]*`npm run check`[\s\S]*`npm run test:e2e`/);
  assert.match(markdown, /## Deployment\n\nNetlify publishes the generated `dist\/` directory as the site, configured in \[netlify\.toml\]\(netlify\.toml\)\./);
  assert.match(markdown, /## Technology[\s\S]*- \*\*Astro\*\* — Framework[\s\S]*- \*\*Astro React integration\*\* — Integration[\s\S]*- \*\*Cypress\*\* — Testing/);
  assert.doesNotMatch(markdown, /## Contributing|## Author/);
  assert.deepEqual(configFromModel(model).projectStructure, model.projectStructure);
  assert.deepEqual(configFromModel(model).deployment, model.deployment);
});

test("CLI dogfood defaults explain the reusable core and project structure", async () => {
  const inspected = await inspectRepository({ root: projectRoot });
  const model = createReadmeModel(inspected);
  const markdown = renderReadme(model);

  assert.equal(inspected.projectType, "cli");
  assert.equal(inspected.languages.some((language) => language.name === "TypeScript"), false);
  assert.deepEqual(inspected.projectStructure.map((entry) => entry.path), [
    "bin",
    "src/core",
    "src/cli",
    "src/terminal",
    "test",
    "site",
  ]);
  assert.equal(model.sections.includes("architecture"), true);
  assert.equal(model.sections.includes("project-structure"), true);
  assert.match(
    markdown,
    /## Architecture\n\nThe CLI coordinates repository inspection, README modeling, Markdown rendering and validation, and file output through reusable modules in `src\/core`\./,
  );
  assert.match(markdown, /\| `src\/terminal` \| Interactive terminal prompts and output formatting \|/);
});

test("renderReadme keeps table literals valid when configured values contain Markdown delimiters", () => {
  const markdown = renderReadme(
    createReadmeModel(facts(), {
      sections: ["commands", "project-structure"],
      commands: [
        {
          id: "test:odd",
          command: "npm run test:`x|y`\r\nnext",
          description: "Run odd | multiline\ntests",
        },
      ],
      projectStructure: [
        { path: "src/`odd|path`\npart", description: "A | strange\r\npath" },
      ],
    }),
  );

  assert.match(markdown, /\| `` npm run test:`x\\\|y` next `` \| Run odd \\\| multiline tests \|/);
  assert.match(markdown, /\| `` src\/`odd\\\|path` part `` \| A \\\| strange path \|/);
});

test("renderReadme keeps deployment literals inside valid Markdown contexts", () => {
  const markdown = renderReadme(
    createReadmeModel(facts(), {
      sections: ["deployment"],
      deployment: {
        provider: "Netlify\n## injected",
        configFile: "deploy) odd[1]\nfile.toml",
        publishDirectory: "dist`oops\r\nnext",
      },
    }),
  );

  assert.doesNotMatch(markdown, /\n## injected/);
  assert.match(markdown, /Netlify \\#\\# injected publishes/);
  assert.match(markdown, /generated `` dist`oops next\/ `` directory/);
  assert.match(
    markdown,
    /\[deploy\) odd\\\[1\\\] file\.toml\]\(deploy%29%20odd%5B1%5D%20file\.toml\)/,
  );
});

test("explicit author and contributing configuration remain supported", () => {
  const markdown = renderReadme(
    createReadmeModel(facts(), {
      sections: ["contributing", "author"],
      contributingFile: "CONTRIBUTING.md",
      author: "Example Maintainer",
    }),
  );

  assert.match(markdown, /## Contributing[\s\S]*\[CONTRIBUTING\.md\]\(CONTRIBUTING\.md\)/);
  assert.match(markdown, /## Author\n\nExample Maintainer/);
  assert.doesNotMatch(markdown, /github\.com\/Example Maintainer/);
});
