#!/usr/bin/env node

import { runCli } from "../src/cli.js";

try {
  const exitCode = await runCli();
  process.exitCode = exitCode;
} catch (error) {
  if (error?.name === "ExitPromptError") {
    process.stderr.write("\nNo files changed.\n");
    process.exitCode = 130;
  } else {
    process.stderr.write(`create-readme: ${error.message}\n`);
    process.exitCode = 1;
  }
}
