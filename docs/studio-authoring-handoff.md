# Clean-session prompt: create-readme Studio authoring

Implement the next **create-readme** milestone at `/Users/gregclark/Code/personal/create-readme`: bring visual design, UX, and software architecture together in a usable local README authoring Studio.

## Start with the real baseline

Read the current working agreement, applicable project instructions, `README.md`, `docs/v2-spec.md`, and `design-qa.md`. Confirm the repository path, branch, and worktree before editing; preserve existing changes. Work on the existing branch, normally `master`; do not create a branch. Do not push to GitHub, commit, tag, publish to npm, dispatch release workflows, or deploy. Finish with a proposed commit message, not a commit.

Source already contains a read-only Local Studio. Inspect the current implementation and package metadata before extending it.

The existing CLI and Studio share repository inspection, saved configuration, document model, Markdown renderer, and validator. Relevant code is under `src/core`, `src/cli.js`, `src/terminal`, and `src/studio`. The Studio frontend is dependency-light HTML/CSS/JavaScript; the server is Node HTTP. Keep this structure unless concrete requirements justify a change. The static marketing website lives in `site`.

## Design direction

Use the available Creative Production and Product Design skills to refine and implement the design. Read their instructions first. Carry the visual direction through working interactions; do not stop at concepts or mockups. If a plugin is unavailable, state that once and continue using the documented references.

Treat the three design directions as complementary parts of one Studio:

- **Composer:** the authoring workspace for intentional content, section selection/order, and badge choices.
- **Document Desk:** the existing calm, document-first rendered preview, with Markdown source available alongside it or by tab.
- **Proof Sheet:** an evidence/review inspector explaining detected facts, overrides, warnings, and proposed file changes.

These are roles within one coherent product, not three separate apps. Use the Document Desk reference recorded in `design-qa.md` to guide the implementation.

Preserve the product's off-white, ink, restrained lime active states, cobalt links/focus, thin borders, system sans-serif, and monospace metadata. Prioritize readable documents and useful controls over dashboard decoration. Support desktop and mobile, keyboard navigation, visible focus, and clear loading/error/empty states.

## Implement an end-to-end authoring flow

1. Scan a repository and load its saved choices. Show which values are detected versus deliberately overridden. Unknown facts stay unknown; never invent architecture or business-domain details.
2. Edit title, description, features, and the supported section content. Include commands, architecture, project structure, testing, deployment, technology, and license where evidence or explicit user input supports them. Build on the current schema rather than creating a second document format.
3. Enable/disable and reorder sections with accessible controls; drag-and-drop must not be the only way to reorder.
4. Select existing badge candidates and compare supported badge styles. Keep a complete offline generation path; remote enrichment is optional, not a prerequisite. Do not choose a license or create license text automatically.
5. Update rendered preview and Markdown from the shared engine. Rescan must not silently discard edits. Make dirty state and reset-to-detected behavior clear.
6. Review validation and an honest diff against the existing output before saving. Support explicit config saving and explicit README writing, with separate, unambiguous outcomes. Do not overwrite an existing README automatically, discard hand-written content without warning, or imply that generated output preserves unsupported sections.
7. Make saved choices reproducible in the CLI. Leave existing CLI flags, core exports, dry-run, and check behavior compatible.

Use isolated fixtures and create-readme itself for dogfooding.

## Software and safety boundaries

Keep a single facts → overrides/model → Markdown → validation pipeline. Put authoritative generation and write validation on the server; the browser manages editing and presentation. Preserve unknown saved-config fields where practical and avoid silently pinning every detected value as an override.

Retain loopback-only binding, session-token authorization, Host/Origin checks, restricted routes, and safe Markdown handling. Add narrowly scoped write endpoints only as required by this milestone. Bound request payloads, validate inputs, prevent traversal/symlink escapes, and restrict writes to the launched repository's intended README/config targets. Detect external changes between preview and save; refuse stale overwrites. Use safe staged/atomic writes where appropriate and report failures or partial outcomes honestly. Preserve the current prohibition on automatic external media requests unless a separately explicit, constrained opt-in is implemented.

Do not add accounts, hosted backend services, mandatory AI, telemetry, or a heavyweight frontend migration. Do not implement the GitHub Action in this milestone. Update misleading read-only labels and stale documentation once authoring works. Make small, relevant website copy adjustments only if needed to describe the local feature accurately; do not undertake an unrelated marketing redesign.

## Completion and verification

Carry the implementation through to a reviewable local result. Run `npm test`, production dependency audit, `npm run site:check` if site files change, and `npm pack --dry-run` to verify packaged Studio assets. Add focused tests for draft/CLI parity, config round-trips, write authorization/path boundaries, stale-write conflicts, and failure handling.

Exercise the complete browser flow on desktop and mobile: edit, reorder, preview, inspect evidence/diff, save config, explicitly write a temporary fixture README, rescan, and handle a conflict/error. Record representative screenshots and actual outcomes in `design-qa.md`; don't claim checks that weren't run. Update `README.md` and `docs/v2-spec.md` to distinguish implemented behavior from future ideas.

Finish with the result, meaningful checks, any remaining limitations, useful file links, and a concise proposed commit message without attribution. No GitHub push, release, or deployment is authorized.
