import assert from "node:assert/strict";
import test from "node:test";

import { parseCliArgs } from "../src/cli/args.js";

test("parseCliArgs provides safe defaults", () => {
  assert.deepEqual(parseCliArgs([]), {
    yes: false,
    dryRun: false,
    check: false,
    force: false,
    output: "README.md",
    config: "readme.config.json",
    saveConfig: false,
    help: false,
    version: false,
    color: undefined,
  });
});

test("parseCliArgs handles automation and output flags", () => {
  const options = parseCliArgs([
    "--yes",
    "--force",
    "--output",
    "docs/README.md",
    "--save-config",
    "--no-color",
  ]);
  assert.equal(options.yes, true);
  assert.equal(options.force, true);
  assert.equal(options.output, "docs/README.md");
  assert.equal(options.saveConfig, true);
  assert.equal(options.color, false);
});

test("parseCliArgs rejects unknown commands", () => {
  assert.throws(() => parseCliArgs(["unknown"]), /Unknown command: unknown/);
});

test("Studio accepts local preview options and rejects writes and invalid ports", () => {
  assert.equal(parseCliArgs(["studio", "--no-open", "--port", "4567"]).port, 4567);
  assert.equal(parseCliArgs(["studio", "--no-open"]).open, false);
  assert.equal(parseCliArgs(["studio"]).port, 0);
  for (const port of ["-1", "65536", "NaN", "2.5"]) {
    assert.throws(() => parseCliArgs(["studio", "--port", port]), /port/);
  }
  for (const flag of ["--force", "--yes", "--save-config", "--check", "--dry-run"]) {
    assert.throws(() => parseCliArgs(["studio", flag]), /read-only/);
  }
  assert.throws(() => parseCliArgs(["--port", "1234"]), /require the studio command/);
});
