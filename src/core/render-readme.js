import { renderBadge } from "./badges.js";

function codeBlock(command) {
  return `\`\`\`bash\n${command}\n\`\`\``;
}

function renderFeatures(model) {
  if (!model.features.length) return null;
  return `## Features\n\n${model.features.map((feature) => `- ${feature}`).join("\n")}`;
}

function renderDemo(model) {
  if (!model.demoPath) return null;
  return `## Demo\n\n![${model.title} demo](${model.demoPath})`;
}

function renderInstallation(model) {
  if (!model.installCommand) return null;
  return `## Installation\n\n${codeBlock(model.installCommand)}`;
}

function renderUsage(model) {
  if (!model.usageCommand) return null;
  return `## Usage\n\n${codeBlock(model.usageCommand)}`;
}

function normalizeInline(value) {
  return String(value).replace(/\r\n?|\n/g, " ");
}

function codeSpan(value) {
  const content = normalizeInline(value);
  const longestRun = Math.max(0, ...[...content.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const padding = longestRun ? " " : "";
  return `${fence}${padding}${content}${padding}${fence}`;
}

function escapeTable(value) {
  return normalizeInline(value).replaceAll("|", "\\|");
}

function tableCode(value) {
  return codeSpan(escapeTable(value));
}

function markdownText(value) {
  return normalizeInline(value).replace(/([\\`*_[\]{}()#+\-.!|>])/g, "\\$1");
}

function linkLabel(value) {
  return normalizeInline(value).replace(/([\\[\]])/g, "\\$1");
}

function linkDestination(value) {
  return normalizeInline(value)
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

function renderCommandTable(commands) {
  if (!commands?.length) return null;
  return [
    "| Command | Description |",
    "| --- | --- |",
    ...commands.map(({ command, description }) => `| ${tableCode(command)} | ${escapeTable(description)} |`),
  ].join("\n");
}

function renderCommands(model) {
  const table = renderCommandTable(model.commands);
  return table ? `## Commands\n\n${table}` : null;
}

function renderArchitecture(model) {
  if (!model.architecture?.summary) return null;
  return `## Architecture\n\n${model.architecture.summary}`;
}

function renderProjectStructure(model) {
  if (!model.projectStructure?.length) return null;
  const rows = model.projectStructure.map(
    ({ path, description }) => `| ${tableCode(path)} | ${escapeTable(description)} |`,
  );
  return `## Project structure\n\n| Path | Purpose |\n| --- | --- |\n${rows.join("\n")}`;
}

function renderTesting(model) {
  const table = renderCommandTable(model.testing?.commands);
  return table ? `## Testing\n\n${table}` : null;
}

function renderDeployment(model) {
  if (!model.deployment?.provider || !model.deployment?.configFile) return null;
  const provider = markdownText(model.deployment.provider);
  const configFile = normalizeInline(model.deployment.configFile);
  const configLink = `[${linkLabel(configFile)}](${linkDestination(configFile)})`;
  if (model.deployment.publishDirectory) {
    const directory = normalizeInline(model.deployment.publishDirectory).replace(/\/$/, "");
    return `## Deployment\n\n${provider} publishes the generated ${codeSpan(`${directory}/`)} directory as the site, configured in ${configLink}.`;
  }
  return `## Deployment\n\nDeployment is configured for ${provider} in ${configLink}.`;
}

function renderTechnology(model) {
  const technology = (model.technologies ?? []).map((item) =>
    typeof item === "string" ? `- ${item}` : `- **${item.name}** — ${item.category}`,
  );
  const details = [...model.languages];
  if (model.runtime) details.push(`Node.js ${model.runtime}`);
  if (!technology.length && !details.length) return null;
  return `## Technology\n\n${[...technology, ...details.map((item) => `- ${item}`)].join("\n")}`;
}

function renderContributing(model) {
  const details = model.contributingFile
    ? `Read [${model.contributingFile}](${model.contributingFile}) before submitting a change.`
    : "Issues and pull requests are welcome.";
  const setup = [];

  if (model.repositoryUrl) {
    setup.push(`git clone ${model.repositoryUrl}.git`, `cd ${model.repository}`);
  }
  if (model.developmentCommand) setup.push(model.developmentCommand);
  if (model.testCommand) setup.push(model.testCommand);

  return [
    "## Contributing",
    "",
    details,
    ...(setup.length ? ["", codeBlock(setup.join("\n"))] : []),
  ].join("\n");
}

function renderLicense(model) {
  if (!model.license) return null;
  return `## License\n\nThis project is licensed under the ${model.license} License.`;
}

function renderAuthor(model) {
  if (!model.author) return null;
  const profile = model.repositoryUrl?.match(/^https:\/\/github\.com\//) && model.author === model.owner
    ? `https://github.com/${model.author}`
    : null;
  return `## Author\n\n${profile ? `[${model.author}](${profile})` : model.author}`;
}

const SECTION_RENDERERS = {
  features: renderFeatures,
  demo: renderDemo,
  installation: renderInstallation,
  usage: renderUsage,
  commands: renderCommands,
  architecture: renderArchitecture,
  "project-structure": renderProjectStructure,
  testing: renderTesting,
  deployment: renderDeployment,
  technology: renderTechnology,
  contributing: renderContributing,
  license: renderLicense,
  author: renderAuthor,
};

export function renderReadme(model) {
  const blocks = [`# ${model.title}`];

  if (model.description) blocks.push(model.description);
  if (model.badges.length) blocks.push(model.badges.map(renderBadge).join(" "));

  for (const section of model.sections) {
    const content = SECTION_RENDERERS[section]?.(model);
    if (content) blocks.push(content);
  }

  return `${blocks.join("\n\n")}\n`;
}
