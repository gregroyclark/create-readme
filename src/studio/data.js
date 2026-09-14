import MarkdownIt from "markdown-it";
import { inspectRepository } from "../core/inspect-repository.js";
import { createBadgeCandidates } from "../core/badges.js";
import { createReadmeModel, SECTION_IDS } from "../core/model.js";
import { renderReadme } from "../core/render-readme.js";
import { validateReadme } from "../core/validate-readme.js";
import { BADGE_STYLES, digest } from "./authoring.js";

// Repository text is untrusted. Disable HTML and all automatic media requests.
const preview = new MarkdownIt({ html: false, linkify: false });
preview.renderer.rules.image = (tokens, index) =>
  `<span class="media-label">${preview.utils.escapeHtml(tokens[index].content || "Image")} · image omitted in local preview</span>`;
preview.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const href = tokens[index].attrGet("href") || "";
  if (!/^(https?:|mailto:|#)/i.test(href)) tokens[index].attrSet("href", "#");
  else if (/^https?:/i.test(href)) {
    tokens[index].attrSet("target", "_blank");
    tokens[index].attrSet("rel", "noreferrer noopener");
  }
  return renderer.renderToken(tokens, index, options);
};

export function renderStudioPreview(markdown) { return preview.render(markdown); }

export async function studioSnapshot(root, {
  overrides = {},
  configPath = "readme.config.json",
  configFound = false,
  targets = {},
} = {}) {
  const facts = await inspectRepository({ root });
  const defaults = createReadmeModel(facts, {});
  const model = createReadmeModel(facts, overrides);
  const markdown = renderReadme(model);
  const validation = await validateReadme(markdown, { root });
  const rows = [
    ["Project", facts.title, "Repository metadata"],
    ["Package", facts.packageName, "package.json"],
    ["Runtime", facts.runtime && `Node.js ${facts.runtime}`, "package.json · engines"],
    ["Languages", facts.languages.map(x => x.name).join(" · "), "Source scan"],
    ["Remote", facts.remote?.slug, "Git remote"],
    ["License", facts.license, facts.licenseFile || "package.json"],
    ["Deployment", facts.deployment?.provider, facts.deployment?.configFile],
  ].filter(([, value]) => value).map(([label, value, source]) => ({ label, value, source: source || "Repository inspection" }));
  return {
    title: model.title, repository: facts.remote?.slug || model.title,
    facts: rows, filesScanned: facts.filesScanned,
    config: configFound ? configPath : null,
    overrides,
    defaults,
    model,
    sectionIds: SECTION_IDS,
    badgeCandidates: createBadgeCandidates(facts, { license: model.license }),
    badgeStyles: BADGE_STYLES,
    targets,
    markdown, html: renderStudioPreview(markdown),
    errors: validation.errors,
    warnings: [...new Set([...model.warnings, ...validation.warnings])],
    factsRevision: digest(facts),
    scannedAt: new Date().toISOString(),
  };
}
