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
      port: { type: "string" },
      open: { type: "boolean", default: true },
    },
    strict: true,
  });

  const studio = parsed.positionals.length === 1 && parsed.positionals[0] === "studio";
  if (parsed.positionals.length > 0 && !studio) {
    throw new Error(`Unknown command: ${parsed.positionals.join(" ")}`);
  }

  if (!studio && (parsed.values.port !== undefined || !parsed.values.open)) {
    throw new Error("--port and --no-open require the studio command");
  }
  const port = parsed.values.port === undefined ? 0 : Number(parsed.values.port);
  if (studio && (!/^\d+$/.test(String(port)) || !Number.isInteger(port) || port > 65535)) {
    throw new Error("Studio port must be an integer from 0 to 65535");
  }
  if (studio && (parsed.values.yes || parsed.values.force || parsed.values.check || parsed.values["dry-run"] || parsed.values["save-config"] || parsed.values.output !== "README.md")) {
    throw new Error("Studio is read-only; generation and write flags are not supported");
  }

  return {
    ...(studio ? { command: "studio", port, open: parsed.values.open } : {}),
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
