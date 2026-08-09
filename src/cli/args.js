import { parseArgs } from "node:util";

export function parseCliArgs(args = process.argv.slice(2)) {
  const parsed = parseArgs({
    args,
    allowNegative: true,
    allowPositionals: true,
    options: {
      yes: { type: "boolean", short: "y", default: false },
      "dry-run": { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      force: { type: "boolean", short: "f", default: false },
      output: { type: "string", short: "o", default: "README.md" },
      config: { type: "string", default: "readme.config.json" },
      "save-config": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
      color: { type: "boolean", default: undefined },
    },
    strict: true,
  });

  if (parsed.positionals.length > 0) {
    throw new Error(`Unknown command: ${parsed.positionals.join(" ")}`);
  }

  return {
    yes: parsed.values.yes,
    dryRun: parsed.values["dry-run"],
    check: parsed.values.check,
    force: parsed.values.force,
    output: parsed.values.output,
    config: parsed.values.config,
    saveConfig: parsed.values["save-config"],
    help: parsed.values.help,
    version: parsed.values.version,
    color: parsed.values.color,
  };
}
