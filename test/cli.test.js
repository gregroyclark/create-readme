import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { runCli } from "../src/cli.js";

function captureStream() {
  const stream = new PassThrough();
  let output = "";
  stream.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { stream, output: () => output };
}

test("runCli writes, verifies, and protects generated output", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "create-readme-cli-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "1.0.0",
      description: "A fixture project.",
      private: true,
      scripts: { start: "node index.js" },
    }),
  );
  await writeFile(path.join(root, "index.js"), "console.log('fixture');\n");

  const firstOut = captureStream();
  const firstErr = captureStream();
  assert.equal(
    await runCli(["--yes", "--output", "GENERATED.md"], {
      cwd: root,
      stdout: firstOut.stream,
      stderr: firstErr.stream,
    }),
    0,
  );
  assert.match(await readFile(path.join(root, "GENERATED.md"), "utf8"), /^# fixture\n/);
  assert.match(firstOut.output(), /Wrote GENERATED\.md/);

  const protectedErr = captureStream();
  assert.equal(
    await runCli(["--yes", "--output", "GENERATED.md"], {
      cwd: root,
      stdout: captureStream().stream,
      stderr: protectedErr.stream,
    }),
    2,
  );
  assert.match(protectedErr.output(), /already exists/);

  assert.equal(
    await runCli(["--check", "--output", "GENERATED.md"], {
      cwd: root,
      stdout: captureStream().stream,
      stderr: captureStream().stream,
    }),
    0,
  );

  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture", description: "A changed description.", private: true }),
  );
  assert.equal(
    await runCli(["--check", "--output", "GENERATED.md"], {
      cwd: root,
      stdout: captureStream().stream,
      stderr: captureStream().stream,
    }),
    1,
  );
});
