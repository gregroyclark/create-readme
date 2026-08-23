import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { parseCliArgs } from "./cli/args.js";
import { loadConfig, saveConfig } from "./core/config.js";
import { inspectRepository } from "./core/inspect-repository.js";
import { configFromModel, createReadmeModel } from "./core/model.js";
import { renderReadme } from "./core/render-readme.js";
import { validateReadme } from "./core/validate-readme.js";
import { writeReadme } from "./core/write-readme.js";
import { createFormatter, formatPreview } from "./terminal/format.js";
import { confirmWrite, promptForModel } from "./terminal/prompts.js";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const HELP = `create-readme ${packageJson.version}

Generate a polished README from facts already present in a repository.

Usage:
  create-readme [options]

Options:
  -y, --yes             Generate without interactive questions
      --dry-run         Print generated Markdown without writing a file
      --check           Exit with an error when the output is missing or stale
  -f, --force           Allow a non-interactive run to overwrite the output
  -o, --output <path>   Output file (default: README.md)
      --config <path>   Config file (default: readme.config.json)
      --save-config     Save resolved choices for reproducible runs
      --no-color        Disable ANSI colors
  -h, --help            Show help
  -v, --version         Show version

Examples:
  create-readme
  create-readme --dry-run
  create-readme --yes --output README.generated.md
  create-readme --check
`;

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function countDetectedFacts(facts) {
  return [
    facts.title,
    facts.description,
    facts.packageName,
    facts.remote,
    facts.languages.length,
    facts.technologies?.length,
    facts.deployment,
    facts.runtime,
    facts.license,
    facts.demoPath,
  ].filter(Boolean).length;
}

function writeLine(stream, value = "") {
  stream.write(`${value}\n`);
}

function showScan(facts, stream, formatter) {
  writeLine(stream, formatter.bold(`create-readme ${packageJson.version}`));
  writeLine(stream, formatter.dim("Repo-aware README generation"));
  writeLine(stream);
  writeLine(
    stream,
    `${formatter.green("✓ Repository scan complete")}  ${formatter.dim(
      `${countDetectedFacts(facts)} facts detected from ${facts.filesScanned} files`,
    )}`,
  );
  writeLine(stream);

  const rows = [
    ["Project", facts.title],
    ["Package", facts.packageName],
    ["Remote", facts.remote?.slug],
    ["Languages", facts.languages.slice(0, 4).map((language) => language.name).join(", ")],
    ["Technology", facts.technologies?.map((technology) => technology.name).join(", ")],
    ["Runtime", facts.runtime ? `Node.js ${facts.runtime}` : null],
    [
      "Deployment",
      facts.deployment
        ? `${facts.deployment.provider}${facts.deployment.publishDirectory ? ` → ${facts.deployment.publishDirectory}` : ""}`
        : null,
    ],
    ["License", facts.license ?? "Not detected"],
    ["Demo", facts.demoPath],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));

  for (const [label, value] of rows) {
    if (value) writeLine(stream, `${formatter.dim(label.padEnd(labelWidth))}  ${value}`);
  }
  writeLine(stream);
}

function showMessages(model, validation, stream, formatter) {
  const errors = [...validation.errors];
  const warnings = [...new Set([...model.warnings, ...validation.warnings])];

  for (const error of errors) writeLine(stream, formatter.red(`Error: ${error}`));
  for (const warning of warnings) writeLine(stream, formatter.yellow(`Warning: ${warning}`));
  if (errors.length || warnings.length) writeLine(stream);
}

async function checkOutput(markdown, outputPath, stream, formatter) {
  if (!(await fileExists(outputPath))) {
    writeLine(stream, formatter.red(`${path.basename(outputPath)} does not exist.`));
    return 1;
  }
  const current = await readFile(outputPath, "utf8");
  if (current !== markdown) {
    writeLine(stream, formatter.red(`${path.basename(outputPath)} is out of date.`));
    writeLine(stream, formatter.dim("Run create-readme to review and write the current result."));
    return 1;
  }
  writeLine(stream, formatter.green(`✓ ${path.basename(outputPath)} is current.`));
  return 0;
}

export async function runCli(args = process.argv.slice(2), context = {}) {
  const cwd = path.resolve(context.cwd ?? process.cwd());
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  let options;

  try {
    options = parseCliArgs(args);
  } catch (error) {
    writeLine(stderr, `create-readme: ${error.message}`);
    writeLine(stderr, "Run create-readme --help for usage.");
    return 2;
  }

  if (options.help) {
    stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    writeLine(stdout, packageJson.version);
    return 0;
  }

  const formatter = createFormatter(stdout, options.color);
  const outputPath = path.resolve(cwd, options.output);
  const loaded = await loadConfig(cwd, options.config);
  const facts = await inspectRepository({ root: cwd });
  const interactive = !options.yes && !options.dryRun && !options.check;

  if (interactive && !stdout.isTTY && !context.allowNonTtyPrompts) {
    writeLine(stderr, "create-readme: interactive mode requires a terminal.");
    writeLine(stderr, "Use --yes for non-interactive generation or --dry-run to print Markdown.");
    return 2;
  }

  if (interactive) showScan(facts, stdout, formatter);
  const model = interactive
    ? await promptForModel(facts, loaded.config)
    : createReadmeModel(facts, loaded.config);
  const markdown = renderReadme(model);
  const validation = await validateReadme(markdown, { root: cwd });

  if (options.dryRun) {
    stdout.write(markdown);
    return validation.valid ? 0 : 1;
  }

  if (options.check) {
    showMessages(model, validation, stderr, formatter);
    if (!validation.valid) return 1;
    return checkOutput(markdown, outputPath, stdout, formatter);
  }

  if (!validation.valid) {
    showMessages(model, validation, stderr, formatter);
    return 1;
  }

  if (!interactive) {
    showMessages(model, validation, stderr, formatter);
  }

  if (interactive) {
    writeLine(stdout, formatter.bold("README preview"));
    writeLine(stdout, formatter.dim("─".repeat(72)));
    writeLine(stdout, formatPreview(markdown, formatter));
    writeLine(stdout, formatter.dim("─".repeat(72)));
    writeLine(stdout);
    showMessages(model, validation, stdout, formatter);
  }

  const exists = await fileExists(outputPath);
  if (exists && !options.force && !interactive) {
    writeLine(stderr, `create-readme: ${options.output} already exists. Use --force to overwrite it.`);
    return 2;
  }
  if (interactive && !options.force) {
    const approved = await confirmWrite(options.output, exists);
    if (!approved) {
      writeLine(stdout, formatter.dim("No files changed."));
      return 0;
    }
  }

  await writeReadme(markdown, outputPath);
  if (options.saveConfig) {
    await saveConfig(configFromModel(model), loaded.path);
  }

  writeLine(stdout, formatter.green(`✓ Wrote ${path.relative(cwd, outputPath) || path.basename(outputPath)}`));
  if (options.saveConfig) {
    writeLine(stdout, formatter.dim(`  Saved ${path.relative(cwd, loaded.path)}`));
  }
  return 0;
}
