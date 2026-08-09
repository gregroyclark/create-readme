import { checkbox, confirm, input, select } from "@inquirer/prompts";

import { createBadgeCandidates } from "../core/badges.js";
import { createReadmeModel, SECTION_IDS } from "../core/model.js";

const SECTION_LABELS = {
  features: "Features",
  demo: "Demo",
  installation: "Installation",
  usage: "Usage",
  technology: "Technology",
  contributing: "Contributing",
  license: "License",
  author: "Author",
};

function required(value) {
  return value.trim() ? true : "Please enter a value.";
}

export async function promptForModel(facts, config = {}) {
  const initial = createReadmeModel(facts, config);
  const title = await input({
    message: "Project title",
    default: initial.title,
    validate: required,
  });
  const description = await input({
    message: "Short description",
    default: initial.description,
    validate: required,
  });

  let sections = await checkbox({
    message: "README sections",
    instructions: "Space to toggle · Enter to continue",
    choices: SECTION_IDS.map((id) => ({
      name: SECTION_LABELS[id],
      value: id,
      checked: initial.sections.includes(id),
      disabled: id === "features" && !initial.features.length ? "add through readme.config.json" : false,
    })),
    required: true,
  });

  let license = initial.license;
  if (sections.includes("license") && !license) {
    license = await select({
      message: "License (choose only the license you intend to use)",
      choices: [
        { name: "MIT", value: "MIT" },
        { name: "Apache 2.0", value: "Apache-2.0" },
        { name: "GPL 3.0", value: "GPL-3.0" },
        { name: "ISC", value: "ISC" },
        { name: "Enter another SPDX identifier", value: "other" },
        { name: "Skip license for now", value: null },
      ],
    });
    if (license === "other") {
      license = await input({ message: "SPDX license identifier", validate: required });
    }
    if (!license) sections = sections.filter((section) => section !== "license");
  }

  const badgeCandidates = createBadgeCandidates(facts, { license });
  let badges = [];
  let badgeStyle = initial.badgeStyle;
  if (badgeCandidates.length) {
    badges = await checkbox({
      message: "Badges",
      choices: badgeCandidates.map((badge) => ({
        name: badge.label,
        value: badge.id,
        checked: initial.badgeIds.includes(badge.id),
      })),
    });
    if (badges.length) {
      badgeStyle = await select({
        message: "Badge style",
        default: badgeStyle,
        choices: [
          { name: "Flat square", value: "flat-square" },
          { name: "Flat", value: "flat" },
          { name: "For the badge", value: "for-the-badge" },
          { name: "Plastic", value: "plastic" },
          { name: "Social", value: "social" },
        ],
      });
    }
  }

  const overrides = {
    ...config,
    title,
    description,
    sections,
    license,
    badges,
    badgeStyle,
  };

  if (sections.includes("demo")) {
    overrides.demoPath = await input({
      message: "Demo image path or URL",
      default: initial.demoPath ?? "",
      validate: required,
    });
  }
  if (sections.includes("installation")) {
    overrides.installCommand = await input({
      message: "Installation command",
      default: initial.installCommand ?? facts.developmentCommand,
      validate: required,
    });
  }
  if (sections.includes("usage")) {
    overrides.usageCommand = await input({
      message: "Usage command",
      default: initial.usageCommand ?? "",
      validate: required,
    });
  }
  if (sections.includes("author")) {
    overrides.author = await input({
      message: "Author or GitHub username",
      default: initial.author ?? "",
      validate: required,
    });
  }

  return createReadmeModel(facts, overrides);
}

export async function confirmWrite(outputName, exists) {
  return confirm({
    message: exists ? `Overwrite ${outputName}?` : `Write ${outputName}?`,
    default: true,
  });
}
