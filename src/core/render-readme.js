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

function renderTechnology(model) {
  const technology = [...model.languages];
  if (model.runtime) technology.push(`Node.js ${model.runtime}`);
  if (!technology.length) return null;
  return `## Technology\n\n${technology.map((item) => `- ${item}`).join("\n")}`;
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
  const profile = model.repositoryUrl?.match(/^https:\/\/github\.com\//)
    ? `https://github.com/${model.author}`
    : null;
  return `## Author\n\n${profile ? `[${model.author}](${profile})` : model.author}`;
}

const SECTION_RENDERERS = {
  features: renderFeatures,
  demo: renderDemo,
  installation: renderInstallation,
  usage: renderUsage,
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
