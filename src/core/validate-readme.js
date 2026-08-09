import { access } from "node:fs/promises";
import path from "node:path";

function isRemoteTarget(target) {
  return /^(?:https?:|mailto:|data:|#)/i.test(target);
}

function withoutCode(markdown) {
  return markdown
    .replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, "")
    .replace(/`[^`\n]+`/g, "");
}

async function missingLocalImages(markdown, root) {
  const matches = [...withoutCode(markdown).matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)];
  const missing = [];

  for (const match of matches) {
    const target = match[1];
    if (isRemoteTarget(target)) continue;
    try {
      await access(path.resolve(root, decodeURIComponent(target)));
    } catch {
      missing.push(target);
    }
  }

  return missing;
}

export async function validateReadme(markdown, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const errors = [];
  const warnings = [];
  const prose = withoutCode(markdown);
  const h1Headings = prose.match(/^#\s+\S.+$/gm) ?? [];

  if (h1Headings.length !== 1) {
    errors.push(`Expected exactly one level-one heading; found ${h1Headings.length}.`);
  }
  if (/^#{1,6}\s*$/m.test(prose)) {
    errors.push("An empty heading was found.");
  }
  if (/<h[1-6][^>]*>/i.test(prose)) {
    warnings.push("Raw HTML headings were found; prefer Markdown headings.");
  }
  if (/\b(?:TODO|TBD|PASTEME)\b/i.test(prose)) {
    warnings.push("Placeholder text remains in the document.");
  }
  if (/[^\n\s][ \t]+$/m.test(markdown)) {
    warnings.push("Trailing whitespace was found.");
  }

  for (const image of await missingLocalImages(markdown, root)) {
    warnings.push(`Local image not found: ${image}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
