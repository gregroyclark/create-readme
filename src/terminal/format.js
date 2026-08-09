const codes = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  green: "\u001B[38;5;118m",
  cyan: "\u001B[36m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
};

function color(enabled, code, value) {
  return enabled ? `${code}${value}${codes.reset}` : String(value);
}

export function createFormatter(stream = process.stdout, forceColor) {
  const enabled = forceColor ?? (Boolean(stream.isTTY) && !("NO_COLOR" in process.env));
  return {
    enabled,
    bold: (value) => color(enabled, codes.bold, value),
    dim: (value) => color(enabled, codes.dim, value),
    green: (value) => color(enabled, codes.green, value),
    cyan: (value) => color(enabled, codes.cyan, value),
    yellow: (value) => color(enabled, codes.yellow, value),
    red: (value) => color(enabled, codes.red, value),
  };
}

export function formatPreview(markdown, formatter) {
  const lines = markdown.trimEnd().split("\n");
  const width = String(lines.length).length;
  return lines
    .map((line, index) => `${formatter.dim(String(index + 1).padStart(width))} ${formatter.dim("│")} ${line}`)
    .join("\n");
}
