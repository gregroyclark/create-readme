import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectRepository } from "../src/core/inspect-repository.js";

async function createEvidenceApplication(context) {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-evidence-app-"));
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
      name: "evidence-app",
      private: true,
      description: "A storefront built with Astro.",
      scripts: {
        dev: "astro dev",
        start: "astro dev --host 0.0.0.0 --port 5000",
        build: "astro build",
        preview: "astro preview --port 8888",
        check: "astro check",
        "test:e2e": "cypress run",
        format: "prettier --write .",
        prepare: "husky",
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
      author: "Fixture Maintainer",
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
  assert.equal(facts.packageAuthor, "Fixture Maintainer");
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

test("inspectRepository does not mistake ordinary application icons for demos", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-icons-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "apps", "mobile", "assets", "images"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
  await writeFile(
    path.join(root, "apps", "mobile", "assets", "images", "android-icon-background.png"),
    "PNG",
  );

  const facts = await inspectRepository({ root });
  assert.equal(facts.demoPath, null);
});

test("inspectRepository normalizes evidence from an Astro application", async (context) => {
  const facts = await inspectRepository({ root: await createEvidenceApplication(context) });

  assert.equal(facts.projectType, "application");
  assert.deepEqual(facts.commands.map((command) => command.id), [
    "install",
    "dev",
    "build",
    "preview",
    "check",
    "test:e2e",
    "format",
  ]);
  assert.equal(facts.commands[0].command, "npm install");
  assert.equal(facts.commands[1].command, "npm run dev");
  assert.equal(facts.commands.find((command) => command.id === "preview").description, "Preview the production build on port 8888");
  assert.equal(facts.commands.some((command) => command.id === "start"), false);
  assert.deepEqual(
    facts.technologies.map((technology) => technology.name),
    ["Astro", "React", "Astro React integration", "Cypress"],
  );
  assert.deepEqual(facts.architecture, {
    summary: "Astro owns file-based routing, page documents, and the production build, while React powers interactive components through the Astro React integration.",
    evidence: ["astro.config.ts", "src/pages", "src/pages/index.astro", "@astrojs/react", "react"],
  });
  assert.deepEqual(facts.projectStructure.map((entry) => entry.path), [
    "src/pages",
    "src/react-pages",
    "src/layouts",
    "src/components",
    "src/lib",
    "public",
  ]);
  assert.deepEqual(facts.testing.commands.map((command) => command.id), ["check", "test:e2e"]);
  assert.deepEqual(facts.deployment, {
    provider: "Netlify",
    configFile: "netlify.toml",
    publishDirectory: "dist",
  });
});

test("inspectRepository distinguishes private packages from runnable applications", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-project-types-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, "private-package");
  const applicationRoot = path.join(root, "application");

  await mkdir(path.join(packageRoot, "src"), { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: "private-package", private: true, scripts: { build: "tsc", test: "node --test" } }),
  );
  await writeFile(path.join(packageRoot, "src", "index.ts"), "export {};");

  await mkdir(path.join(applicationRoot, "public"), { recursive: true });
  await writeFile(
    path.join(applicationRoot, "package.json"),
    JSON.stringify({
      name: "application",
      private: true,
      scripts: { dev: "node dev.js", start: "node server.js" },
    }),
  );
  await writeFile(path.join(applicationRoot, "public", "index.html"), "<!doctype html>");

  const packageFacts = await inspectRepository({ root: packageRoot });
  const applicationFacts = await inspectRepository({ root: applicationRoot });

  assert.equal(packageFacts.projectType, "package");
  assert.equal(applicationFacts.projectType, "application");
  assert.deepEqual(applicationFacts.commands.map((command) => command.id), ["install", "dev", "start"]);
});

test("inspectRepository requires configured and hydrated React evidence for architecture claims", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-architecture-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src", "pages"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "astro-with-unused-react",
      dependencies: { astro: "latest", react: "latest", "@astrojs/react": "latest" },
    }),
  );
  await writeFile(path.join(root, "astro.config.mjs"), "export default {};\n");
  await writeFile(
    path.join(root, "src", "pages", "index.astro"),
    '---\nimport Widget from "../Widget.jsx";\n---\n<Widget client:load />\n',
  );

  const facts = await inspectRepository({ root });

  assert.equal(facts.architecture.summary, "Astro owns file-based routing, page documents, and the production build.");
  assert.deepEqual(facts.architecture.evidence, ["astro.config.mjs", "src/pages"]);
});

test("inspectRepository formats commands for supported package managers", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-package-managers-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const expected = {
    npm: ["npm install", "npm run dev", "npm test"],
    yarn: ["yarn install", "yarn dev", "yarn test"],
    pnpm: ["pnpm install", "pnpm dev", "pnpm test"],
    bun: ["bun install", "bun run dev", "bun run test"],
  };

  for (const packageManager of Object.keys(expected)) {
    const projectRoot = path.join(root, packageManager);
    await mkdir(path.join(projectRoot, "public"), { recursive: true });
    await writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({
        name: `${packageManager}-application`,
        packageManager: `${packageManager}@1.0.0`,
        scripts: { dev: "serve public", test: "node --test" },
      }),
    );
    await writeFile(path.join(projectRoot, "public", "index.html"), "<!doctype html>");
    const facts = await inspectRepository({ root: projectRoot });
    assert.deepEqual(facts.commands.map((command) => command.command), expected[packageManager]);
  }
});

test("inspectRepository leaves unsupported architecture and deployment facts empty", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-no-inference-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", private: true }));
  await writeFile(path.join(root, "netlify.toml"), "[build]\ncommand = \"npm run build\"\n");

  const facts = await inspectRepository({ root });
  assert.equal(facts.architecture, null);
  assert.deepEqual(facts.projectStructure, []);
  assert.equal(facts.testing, null);
  assert.deepEqual(facts.deployment, {
    provider: "Netlify",
    configFile: "netlify.toml",
    publishDirectory: null,
  });
});
