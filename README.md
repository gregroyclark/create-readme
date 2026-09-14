# create-readme

A repo-aware CLI that turns facts already in a project into a clean, useful README.

![Beta status](https://img.shields.io/badge/status-v2_beta-84cc16?style=flat-square)
![Node.js requirement](https://img.shields.io/badge/node-%3E%3D22.13.0-339933?style=flat-square&logo=node.js&logoColor=white)
![MIT license](https://img.shields.io/badge/license-MIT-2563eb?style=flat-square)

> Version 2 is available as a public beta and remains under active development.

Website: [createreadme.com](https://createreadme.com)

## Local Studio

From the repository you want to inspect, run the local checkout's CLI:

```sh
node /path/to/create-readme/bin/create-readme.js studio
```

Studio opens a local browser workspace with detected repository facts, explicit overrides, a rendered README preview, and a Markdown tab. It uses the same scanner, saved configuration, document model, renderer, and validator as the terminal tool. **Rescan repository** refreshes repository facts while retaining an unsaved draft.

Use `studio --no-open` to open the printed URL yourself, `--port 4317` to select a port, or `--config path/to/config.json` to select saved choices. Studio accepts a config path only when it remains inside the launched repository root. The default port is selected automatically. Keep the full URL, including its session fragment. Press Ctrl+C in the terminal to stop Studio.

Studio is a local authoring workspace. Edit title, description, features, supported section content, section enablement/order (with accessible Up/Down controls), badges, and badge style; use **Use detected value** or **Reset all to detected** to remove intentional overrides. Rendered and Markdown views use the shared generation pipeline. The Evidence view distinguishes detected facts from saved choices and shows architecture evidence. Badge styles are compared by descriptions and generated URLs; no remote artwork is fetched.

**Review & save** shows the full before/after README replacement and a separate configuration comparison. Saving config writes only `readme.config.json`; writing README replaces only the repository-root `README.md`. Each action requires its own explicit confirmation. Draft edits are not persisted until a save succeeds, and stale files or a changed repository invalidate the review instead of overwriting newer work. The preview escapes raw HTML, omits images, and does not serve relative file links; this is not a full GitHub renderer.

The server listens only on `127.0.0.1`, restricts routes to its bundled interface and preview API, and requires a per-session token for repository data. This feature is in the local source checkout; it has not yet been published to npm.

## Why this exists

The original 2020 project asked a short series of questions and wrote the answers into `PASTEME.md`. Version 2 keeps that friendly workflow, but starts by inspecting the repository so developers only answer what the code cannot already tell us.

- Detects package metadata, Git remotes, languages, runtime, license, demo media, and useful package scripts
- Recognizes common framework and integration evidence, supported deployment configuration, tests, and familiar application paths
- Asks focused questions instead of presenting a hard-coded technology checklist
- Produces clean GitHub-flavored Markdown
- Previews and validates output before an interactive write
- Protects existing files during non-interactive runs
- Supports deterministic dry-run and CI check modes
- Generates restrained Shields.io badges from detected facts

## Try it

Version 2 currently requires Node.js 22.13 or newer.

```bash
npx @gregroyclark/create-readme
```

## Commands

```text
create-readme                       Scan, prompt, preview, and write README.md
create-readme --dry-run             Print Markdown without writing
create-readme --yes                 Generate without prompts
create-readme --check               Fail when README.md is missing or stale
create-readme --output docs/intro.md Choose another output file
create-readme --save-config         Save reproducible choices
```

Run `create-readme --help` for every option. Non-interactive generation never overwrites an existing file unless `--force` is provided.

## Configuration

Add `readme.config.json` when the same choices should be reusable in the CLI, Local Studio, and CI. Studio preserves unknown config fields when saving.

```json
{
  "title": "create-readme",
  "description": "Generate polished README files from repository context.",
  "sections": [
    "features",
    "demo",
    "installation",
    "usage",
    "commands",
    "architecture",
    "project-structure",
    "testing",
    "deployment",
    "technology",
    "license"
  ],
  "features": [
    "Scans the repository before asking questions",
    "Generates clean GitHub-flavored Markdown"
  ],
  "badges": ["license", "node"],
  "badgeStyle": "flat-square"
}
```

Detected values remain the default. Configuration only overrides the choices that should be intentional and repeatable.

For applications, the default README can include evidence-backed `commands`, `architecture`, `project-structure`, `testing`, `deployment`, and `technology` sections. CLI projects can also gain architecture and project-structure sections when the scanner can prove the relationship between the command layer and reusable core modules. Architecture is only inferred from high-confidence source and framework markers; it never invents business-domain details. The generated commands favor a `dev` script over a duplicate legacy `start` alias, and omit maintenance or scaffolding scripts.

The new values are additive and editable in configuration when the detected defaults need refinement:

```json
{
  "commands": [
    { "id": "install", "command": "npm install", "description": "Install dependencies" },
    { "id": "dev", "command": "npm run dev", "description": "Start the development server" }
  ],
  "architecture": {
    "summary": "Astro owns file-based routing, page documents, and the production build, while React powers interactive components through the Astro React integration.",
    "evidence": ["astro.config.mjs", "@astrojs/react", "react"]
  },
  "projectStructure": [
    { "path": "src/components", "description": "Reusable UI components" }
  ],
  "testing": {
    "commands": [
      { "id": "test:e2e", "command": "npm run test:e2e", "description": "Run e2e tests" }
    ]
  },
  "deployment": {
    "provider": "Netlify",
    "configFile": "netlify.toml",
    "publishDirectory": "dist"
  }
}
```

`contributing` is selected automatically only when a CONTRIBUTING file exists. `author` is not inferred from a Git remote; set it explicitly, or use package metadata for a publishable package.

## Programmatic core

The scanner and renderer are public so future interfaces do not need to reimplement README generation.

```js
import {
  createReadmeModel,
  inspectRepository,
  renderReadme,
  validateReadme,
} from "@gregroyclark/create-readme/core";

const facts = await inspectRepository({ root: process.cwd() });
const model = createReadmeModel(facts, { badgeStyle: "flat-square" });
const markdown = renderReadme(model);
const validation = await validateReadme(markdown, { root: process.cwd() });
```

## Product direction

The terminal is the first surface over a shared engine:

1. **Terminal CLI** — fast, local README creation for everyday use
2. **Local Studio** — local authoring, evidence, review, and explicitly confirmed config/README saves
3. **GitHub Action** — reviewable README maintenance through pull requests

See [the v2 product and technical specification](docs/v2-spec.md) for the boundaries between those surfaces.

## Development

```bash
npm install
npm test
npm run test:coverage
npm run check
```

The test suite uses Node's built-in test runner and covers remote parsing, repository inspection, model overrides, badge rendering, Markdown validation, CLI flags, Studio authoring and conflict handling, safe writes, and CI checks.

The website is a dependency-light static build served by Cloudflare Pages:

```bash
npm run site:dev
npm run site:check
```

## CI and npm releases

Every push and pull request targeting `master` runs the Node.js test suite on Ubuntu, macOS, and Windows with Node 22.13.0 and Node 24. The production dependency audit runs once on Ubuntu with Node 24.

Maintainers publish from **Actions → Release to npm → Run workflow** while `master` is selected. Enter one canonical SemVer version (for example, `2.0.0-beta.4` or `2.0.0`) and choose the only valid tag:

- Prereleases use `beta`.
- Stable releases use `latest`.

`release.yml` is the manual coordinator: it validates the request, reruns the full test matrix, commits the package and lockfile version directly to `master`, creates its matching annotated `v<version>` tag, and atomically pushes both. It then sends the new release commit to `publish.yml`, the npm trusted-publisher workflow. The publisher validates that the dispatch, default branch, checked-out commit, `origin/master`, and annotated tag all name that same release commit before it packs and publishes the exact validated tarball.

The npm package is [@gregroyclark/create-readme](https://www.npmjs.com/package/@gregroyclark/create-readme); its GitHub repository is `gregroyclark/create-readme`. The workflows do not create a GitHub Release, alter a dist-tag after publishing, or deploy the website.

One-time maintainer setup is required before the first release:

- Allow the repository workflow token to fast-forward `master` and create tags; keep branch rules compatible with that direct release commit.
- Create a GitHub environment named `npm`, restrict it to `master`, and do not require reviewers if releases should remain one-action.
- In npm, configure trusted publishing for package `@gregroyclark/create-readme` from GitHub repository `gregroyclark/create-readme`, workflow filename `publish.yml`, environment `npm`, and the `npm publish` action.
- Do not add an npm token or npm secret. Publication uses the workflow's OIDC identity only.
- Keep the repository public: npm provenance requires a public source repository.

Git and npm cannot be atomic together. Recovery is deliberately narrow:

- If the release commit and tag were pushed but dispatch failed, use **Re-run failed jobs** on that same coordinator run so only its dispatch job is retried. Do not start a new release run for the same version.
- If publication is ambiguous, rerun the same failed publisher workflow run. Its first attempt rejects any pre-existing version; a later attempt accepts one only after npm cryptographically verifies matching signed provenance for this exact publisher run.
- If only verification fails because npm has not propagated yet, rerun only verification. It does not publish again.
- Integrity, selected tag, provenance, source identity, or workflow-policy mismatches are terminal and require investigation.

There is one intentional fail-closed race: if `master` advances between the atomic release push and the repository dispatch, the publisher rejects the release because the default-branch SHA is no longer the release commit. Do not repair that state by re-dispatching, moving tags, force-pushing, unpublishing, or editing dist-tags.

## The original

This was one of my first JavaScript projects. The original terminal demo is staying in the repository as part of that history:

![Original create-readme terminal demo](assets/create-readme.gif)

## License

[MIT](LICENSE) © 2020–2026 Greg Clark
