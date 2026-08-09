const BADGE_STYLES = new Set(["flat", "flat-square", "for-the-badge", "plastic", "social"]);

function shieldsText(value) {
  return String(value)
    .replaceAll("-", "--")
    .replaceAll("_", "__")
    .replaceAll(" ", "_");
}

function query(style, extra = {}) {
  const parameters = new URLSearchParams({
    style: BADGE_STYLES.has(style) ? style : "flat-square",
    ...extra,
  });
  return parameters.toString();
}

export function createBadgeCandidates(facts, overrides = {}) {
  const license = overrides.license ?? facts.license;
  const candidates = [];

  if (license) {
    candidates.push({
      id: "license",
      label: `License: ${license}`,
      default: true,
    });
  }

  if (facts.packageName && !facts.private) {
    candidates.push({
      id: "npm-version",
      label: `npm version: ${facts.packageName}`,
      default: false,
    });
  }

  if (facts.runtime) {
    candidates.push({
      id: "node",
      label: `Node.js: ${facts.runtime}`,
      default: false,
    });
  }

  if (facts.remote?.isGitHub && facts.workflowFile) {
    candidates.push({
      id: "ci",
      label: `CI: ${pathLabel(facts.workflowFile)}`,
      default: false,
    });
  }

  return candidates;
}

function pathLabel(file) {
  return file.split("/").at(-1).replace(/\.ya?ml$/i, "");
}

export function buildBadges(facts, options = {}) {
  const style = options.style ?? "flat-square";
  const license = options.license ?? facts.license;
  const selected = new Set(options.ids ?? []);
  const badges = [];

  if (selected.has("license") && license) {
    const image = facts.remote?.isGitHub && facts.licenseFile
      ? `https://img.shields.io/github/license/${facts.remote.slug}?${query(style)}`
      : `https://img.shields.io/badge/license-${shieldsText(license)}-2563eb?${query(style)}`;
    badges.push({
      alt: `${license} license`,
      image,
      link: facts.licenseFile && facts.repositoryUrl
        ? `${facts.repositoryUrl}/blob/${facts.defaultBranch || "HEAD"}/${facts.licenseFile}`
        : null,
    });
  }

  if (selected.has("npm-version") && facts.packageName && !facts.private) {
    const packageName = encodeURIComponent(facts.packageName);
    badges.push({
      alt: "npm version",
      image: `https://img.shields.io/npm/v/${packageName}?${query(style, { logo: "npm" })}`,
      link: `https://www.npmjs.com/package/${packageName}`,
    });
  }

  if (selected.has("node") && facts.runtime) {
    badges.push({
      alt: `Node.js ${facts.runtime}`,
      image: `https://img.shields.io/badge/node-${shieldsText(facts.runtime)}-339933?${query(style, {
        logo: "node.js",
        logoColor: "white",
      })}`,
      link: "https://nodejs.org/",
    });
  }

  if (selected.has("ci") && facts.remote?.isGitHub && facts.workflowFile) {
    const workflow = facts.workflowFile.split("/").at(-1);
    const parameters = { branch: facts.defaultBranch || "master" };
    badges.push({
      alt: "CI status",
      image: `https://img.shields.io/github/actions/workflow/status/${facts.remote.slug}/${workflow}?${query(
        style,
        parameters,
      )}`,
      link: `${facts.repositoryUrl}/actions/workflows/${workflow}`,
    });
  }

  return badges;
}

export function renderBadge(badge) {
  const image = `![${badge.alt}](${badge.image})`;
  return badge.link ? `[${image}](${badge.link})` : image;
}
