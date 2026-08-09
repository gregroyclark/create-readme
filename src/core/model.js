import { buildBadges, createBadgeCandidates } from "./badges.js";

export const SECTION_IDS = [
  "features",
  "demo",
  "installation",
  "usage",
  "technology",
  "contributing",
  "license",
  "author",
];

function defaultSections(facts, overrides) {
  return [
    ...(overrides.features?.length ? ["features"] : []),
    ...(facts.demoPath ? ["demo"] : []),
    "installation",
    ...(facts.usageCommand ? ["usage"] : []),
    ...(facts.languages.length ? ["technology"] : []),
    "contributing",
    ...(overrides.license ?? facts.license ? ["license"] : []),
    ...(facts.owner ? ["author"] : []),
  ];
}

function normalizedSections(sections) {
  return [...new Set(sections)].filter((section) => SECTION_IDS.includes(section));
}

export function createReadmeModel(facts, overrides = {}) {
  const license = overrides.license === undefined ? facts.license : overrides.license;
  const sections = normalizedSections(overrides.sections ?? defaultSections(facts, overrides));
  const badgeCandidates = createBadgeCandidates(facts, { license });
  const badgeIds = overrides.badges ?? badgeCandidates.filter((badge) => badge.default).map((badge) => badge.id);
  const badgeStyle = overrides.badgeStyle ?? "flat-square";
  const warnings = [];

  if (license && !facts.licenseFile) {
    warnings.push(`The package declares ${license}, but no LICENSE file was detected.`);
  }
  if (facts.licenseConflict) {
    warnings.push("The LICENSE file and package.json declare different licenses.");
  }
  if (!String(overrides.description ?? facts.description).trim()) {
    warnings.push("The project description is empty.");
  }
  if (facts.scanTruncated) {
    warnings.push(`Repository inspection stopped after ${facts.filesScanned} files.`);
  }

  return {
    title: String(overrides.title ?? facts.title).trim(),
    description: String(overrides.description ?? facts.description).trim(),
    features: (overrides.features ?? []).map((feature) => String(feature).trim()).filter(Boolean),
    sections,
    badgeIds,
    badgeStyle,
    badges: buildBadges(facts, { ids: badgeIds, style: badgeStyle, license }),
    demoPath: overrides.demoPath === undefined ? facts.demoPath : overrides.demoPath,
    installCommand: overrides.installCommand ?? facts.installCommand,
    usageCommand: overrides.usageCommand ?? facts.usageCommand,
    languages: overrides.languages ?? facts.languages.map((language) => language.name),
    license,
    contributingFile: overrides.contributingFile ?? facts.contributingFile,
    author: overrides.author ?? facts.owner,
    repository: facts.repository,
    repositoryUrl: facts.repositoryUrl,
    developmentCommand: facts.developmentCommand,
    testCommand: facts.testCommand,
    runtime: facts.runtime,
    packageManager: facts.packageManager,
    warnings,
  };
}

export function configFromModel(model) {
  return {
    title: model.title,
    description: model.description,
    sections: model.sections,
    badges: model.badgeIds,
    badgeStyle: model.badgeStyle,
    demoPath: model.demoPath,
    installCommand: model.installCommand,
    usageCommand: model.usageCommand,
    license: model.license,
    author: model.author,
    ...(model.features.length ? { features: model.features } : {}),
  };
}
