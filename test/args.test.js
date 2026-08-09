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
  assert.throws(() => parseCliArgs(["studio"]), /Unknown command: studio/);
});
