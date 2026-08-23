import { buildBadges, createBadgeCandidates } from "./badges.js";

export const SECTION_IDS = [
  "features",
  "demo",
  "installation",
  "usage",
  "commands",
  "architecture",
  "project-structure",
  "testing",
  "deployment",
  "technology",
  "contributing",
  "license",
  "author",
];

function defaultSections(facts, overrides) {
  const application = facts.projectType === "application";
  const commands = overrides.commands ?? facts.commands ?? [];
  const architecture = normalizedArchitecture(overrides.architecture, facts.architecture);
  const projectStructure = overrides.projectStructure ?? facts.projectStructure ?? [];
  const testing = overrides.testing ?? facts.testing;
  const deployment = overrides.deployment ?? facts.deployment;
  const technologies = overrides.technologies ?? facts.technologies ?? [];
  const languages = overrides.languages ?? facts.languages ?? [];
  const author = defaultAuthor(facts, overrides);
  return [
    ...(overrides.features?.length ? ["features"] : []),
    ...(facts.demoPath ? ["demo"] : []),
    ...(application && commands.length ? ["commands"] : []),
    ...(!application ? ["installation"] : []),
    ...(!application && facts.usageCommand ? ["usage"] : []),
    ...(architecture ? ["architecture"] : []),
    ...(projectStructure.length && (application || projectStructure.length >= 2)
      ? ["project-structure"]
      : []),
    ...(application && testing?.commands?.length ? ["testing"] : []),
    ...(application && deployment ? ["deployment"] : []),
    ...(technologies.length || languages.length ? ["technology"] : []),
    ...(overrides.contributingFile ?? facts.contributingFile ? ["contributing"] : []),
    ...(overrides.license ?? facts.license ? ["license"] : []),
    ...(author ? ["author"] : []),
  ];
}

function normalizedArchitecture(value, fallback) {
  if (value === undefined) return fallback ?? null;
  if (!value) return null;
  if (typeof value === "string") {
    return { ...(fallback ?? { evidence: [] }), summary: value.trim() };
  }
  const summary = String(value.summary ?? fallback?.summary ?? "").trim();
  return summary
    ? { summary, evidence: value.evidence ?? fallback?.evidence ?? [] }
    : null;
}

function defaultAuthor(facts, overrides) {
  if (overrides.author !== undefined) return overrides.author;
  return !facts.private && ["package", "cli"].includes(facts.projectType) ? facts.packageAuthor ?? null : null;
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
    commands: overrides.commands ?? facts.commands ?? [],
    architecture: normalizedArchitecture(overrides.architecture, facts.architecture),
    projectStructure: overrides.projectStructure ?? facts.projectStructure ?? [],
    testing: overrides.testing ?? facts.testing ?? null,
    deployment: overrides.deployment ?? facts.deployment ?? null,
    technologies: overrides.technologies ?? facts.technologies ?? [],
    languages: overrides.languages ?? (facts.languages ?? []).map((language) => language.name),
    license,
    contributingFile: overrides.contributingFile ?? facts.contributingFile,
    author: defaultAuthor(facts, overrides),
    repository: facts.repository,
    repositoryUrl: facts.repositoryUrl,
    owner: facts.owner,
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
    commands: model.commands,
    architecture: model.architecture,
    projectStructure: model.projectStructure,
    testing: model.testing,
    deployment: model.deployment,
    technologies: model.technologies,
    license: model.license,
    author: model.author,
    ...(model.features.length ? { features: model.features } : {}),
  };
}
