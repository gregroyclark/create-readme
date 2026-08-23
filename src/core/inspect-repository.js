import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { inspectGit } from "./git.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const LANGUAGE_BY_EXTENSION = new Map([
  [".c", "C"],
  [".cc", "C++"],
  [".cpp", "C++"],
  [".cs", "C#"],
  [".css", "CSS"],
  [".dart", "Dart"],
  [".ex", "Elixir"],
  [".exs", "Elixir"],
  [".go", "Go"],
  [".html", "HTML"],
  [".java", "Java"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".kt", "Kotlin"],
  [".kts", "Kotlin"],
  [".lua", "Lua"],
  [".mjs", "JavaScript"],
  [".php", "PHP"],
  [".py", "Python"],
  [".rb", "Ruby"],
  [".rs", "Rust"],
  [".scss", "Sass"],
  [".sh", "Shell"],
  [".swift", "Swift"],
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".vue", "Vue"],
]);

const DEMO_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const DEMO_WORDS = /(demo|preview|screenshot|screen|walkthrough)/i;
const MAX_FILES = 5_000;

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function listFiles(root) {
  const files = [];
  const directories = [""];

  while (directories.length > 0 && files.length < MAX_FILES) {
    const relativeDirectory = directories.pop();
    const absoluteDirectory = path.join(root, relativeDirectory);
    let entries;

    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      const relativePath = path.join(relativeDirectory, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) {
          directories.push(relativePath);
        } else if (relativePath === ".github") {
          directories.push(relativePath);
        }
      } else if (entry.isFile()) {
        files.push(relativePath.split(path.sep).join("/"));
      }
    }
  }

  return files;
}

function detectPackageManager(files, packageJson) {
  const declared = packageJson?.packageManager?.split("@")[0];
  if (["npm", "pnpm", "yarn", "bun"].includes(declared)) return declared;
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lock") || files.includes("bun.lockb")) return "bun";
  return "npm";
}

function detectLanguages(files) {
  const counts = new Map();

  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION.get(path.extname(file).toLowerCase());
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, fileCount]) => ({ name, fileCount }));
}

function detectDemoPath(files) {
  return (
    files
      .filter((file) => {
        const extension = path.extname(file).toLowerCase();
        if (!DEMO_EXTENSIONS.has(extension)) return false;
        return DEMO_WORDS.test(file) || (file.startsWith("assets/") && extension === ".gif");
      })
      .sort((left, right) => {
        const score = (file) =>
          (file.startsWith("assets/") ? 4 : 0) +
          (DEMO_WORDS.test(path.basename(file)) ? 3 : 0) +
          (path.extname(file).toLowerCase() === ".gif" ? 1 : 0);
        return score(right) - score(left) || left.localeCompare(right);
      })[0] ?? null
  );
}

function detectLicenseFromText(text) {
  const samples = [
    [/MIT License/i, "MIT"],
    [/Apache License[\s\S]{0,80}Version 2\.0/i, "Apache-2.0"],
    [/GNU (?:AFFERO )?GENERAL PUBLIC LICENSE[\s\S]{0,100}Version 3/i, "GPL-3.0"],
    [/Mozilla Public License[\s\S]{0,80}2\.0/i, "MPL-2.0"],
    [/ISC License/i, "ISC"],
    [/BSD 3-Clause/i, "BSD-3-Clause"],
  ];
  return samples.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

async function inspectLicense(root, files, packageJson) {
  const licenseFile = files.find((file) => /^licen[cs]e(?:\.[^/]+)?$/i.test(file)) ?? null;
  let fileLicense = null;

  if (licenseFile) {
    try {
      fileLicense = detectLicenseFromText((await readFile(path.join(root, licenseFile), "utf8")).slice(0, 8_000));
    } catch {
      fileLicense = null;
    }
  }

  const packageLicense =
    typeof packageJson?.license === "string" && packageJson.license.toUpperCase() !== "UNLICENSED"
      ? packageJson.license
      : null;

  return {
    license: fileLicense ?? packageLicense,
    licenseFile,
    licenseSource: fileLicense ? licenseFile : packageLicense ? "package.json" : null,
    licenseConflict: Boolean(fileLicense && packageLicense && fileLicense !== packageLicense),
  };
}

function defaultInstallCommand(packageManager, packageJson) {
  if (packageJson?.bin && packageJson?.name && !packageJson.private) {
    return `npx ${packageJson.name}`;
  }
  return `${packageManager} install`;
}

function defaultUsageCommand(packageManager, packageJson, projectType) {
  if (projectType === "application" && packageJson?.scripts?.dev) return scriptCommand(packageManager, "dev");
  if (packageJson?.bin && packageJson?.name) return `npx ${packageJson.name}`;
  if (packageJson?.scripts?.start) return `${packageManager} start`;
  if (packageJson?.scripts?.dev) return `${packageManager} run dev`;
  return null;
}

const COMMAND_ORDER = ["dev", "build", "preview", "start", "check", "typecheck", "lint", "test"];
const SECONDARY_COMMAND_ORDER = ["format"];
const NOISY_SCRIPT = /^(?:pre|post|prepare|prepublish|publish|release|version|clean|generate|scaffold|new)(?::|$)/i;
const TEST_SCRIPT = /^(?:test(?::|$)|e2e(?::|$)|integration(?::|$)|unit(?::|$))/i;

function scriptCommand(packageManager, id) {
  if (packageManager === "npm") return id === "start" || id === "test" ? `npm ${id}` : `npm run ${id}`;
  if (packageManager === "yarn") return `yarn ${id}`;
  if (packageManager === "pnpm") return `pnpm ${id}`;
  return `bun run ${id}`;
}

function commandDescription(id, script = "") {
  const descriptions = {
    install: "Install dependencies",
    dev: "Start the development server",
    build: "Create a production build",
    preview: "Preview the production build",
    start: "Start the application",
    check: "Run project checks",
    typecheck: "Check types",
    lint: "Lint the codebase",
    test: "Run the test suite",
    format: "Format the codebase",
  };
  const port = script.match(/--port(?:=|\s+)(\d+)/)?.[1];
  if (id === "preview" && port) return `${descriptions.preview} on port ${port}`;
  if (descriptions[id]) return descriptions[id];
  if (id === "test:e2e") return "Run end-to-end tests";
  if (id.startsWith("test:")) return `Run ${id.slice(5).replaceAll("-", " ")} tests`;
  return `Run ${id.replaceAll(":", " ").replaceAll("-", " ")}`;
}

function detectCommands(packageManager, packageJson, projectType) {
  const scripts = packageJson?.scripts ?? {};
  const ids = Object.keys(scripts).filter((id) => !NOISY_SCRIPT.test(id));
  const ordered = [
    ...COMMAND_ORDER.filter((id) => ids.includes(id)),
    ...ids.filter((id) => TEST_SCRIPT.test(id) && !COMMAND_ORDER.includes(id)).sort(),
    ...SECONDARY_COMMAND_ORDER.filter((id) => ids.includes(id)),
  ];
  const seenValues = new Set();
  const developmentScript = String(scripts.dev ?? "").trim();

  const scriptCommands = ordered.flatMap((id) => {
    const script = String(scripts[id]).trim();
    if (
      projectType === "application" &&
      id === "start" &&
      developmentScript &&
      normalizedServerScript(script) === normalizedServerScript(developmentScript)
    ) {
      return [];
    }
    if (!script || seenValues.has(script)) return [];
    seenValues.add(script);
    return [{ id, command: scriptCommand(packageManager, id), description: commandDescription(id, script) }];
  });

  return [
    ...(packageJson
      ? [{ id: "install", command: `${packageManager} install`, description: commandDescription("install") }]
      : []),
    ...scriptCommands,
  ];
}

function normalizedServerScript(script) {
  return script
    .replace(/\s+--(?:host|port)(?:(?:=|\s+)[^\s]+)?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dependencyNames(packageJson) {
  return new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {}),
    ...Object.keys(packageJson?.peerDependencies ?? {}),
  ]);
}

function detectProjectType(packageJson, files) {
  const dependencies = dependencyNames(packageJson);
  const framework = ["astro", "next", "nuxt", "@sveltejs/kit", "@angular/core"].some((name) =>
    dependencies.has(name),
  );
  const runnable = Boolean(packageJson?.scripts?.dev || packageJson?.scripts?.start);
  const applicationPath =
    files.includes("index.html") ||
    ["app", "public", "src/app", "src/pages"].some((directory) => hasPath(files, directory));
  const frameworkMarker =
    files.includes("astro.config.mjs") ||
    files.includes("astro.config.ts") ||
    files.includes("astro.config.js");
  if (packageJson?.bin && !framework && !frameworkMarker) return "cli";
  if (
    framework ||
    frameworkMarker ||
    (runnable && applicationPath)
  ) {
    return "application";
  }
  return packageJson?.bin ? "cli" : "package";
}

function detectTechnologies(packageJson) {
  const dependencies = dependencyNames(packageJson);
  const definitions = [
    ["astro", "Astro", "Framework"],
    ["next", "Next.js", "Framework"],
    ["nuxt", "Nuxt", "Framework"],
    ["vite", "Vite", "Build tool"],
    ["@sveltejs/kit", "SvelteKit", "Framework"],
    ["@angular/core", "Angular", "Framework"],
    ["react", "React", "UI library"],
    ["vue", "Vue", "UI library"],
    ["svelte", "Svelte", "UI library"],
    ["@astrojs/react", "Astro React integration", "Integration"],
    ["@astrojs/vue", "Astro Vue integration", "Integration"],
    ["@astrojs/svelte", "Astro Svelte integration", "Integration"],
    ["cypress", "Cypress", "Testing"],
    ["@playwright/test", "Playwright", "Testing"],
    ["playwright", "Playwright", "Testing"],
    ["vitest", "Vitest", "Testing"],
    ["jest", "Jest", "Testing"],
  ];
  return definitions
    .filter(([name]) => dependencies.has(name))
    .map(([, name, category]) => ({ name, category }))
    .filter((technology, index, detected) =>
      detected.findIndex((candidate) => candidate.name === technology.name) === index,
    );
}

function hasPath(files, directory) {
  return files.some((file) => file.startsWith(`${directory}/`));
}

function detectProjectStructure(files) {
  const definitions = [
    ["src/pages", "Route and page components"],
    ["src/react-pages", "React page components"],
    ["src/layouts", "Shared page layouts"],
    ["src/components", "Reusable UI components"],
    ["src/lib", "Shared application utilities"],
    ["public", "Static assets served as-is"],
    ["bin", "Command-line entry points"],
    ["src/core", "Reusable core logic"],
    ["src/cli", "CLI argument parsing and command handlers"],
    ["src/terminal", "Interactive terminal prompts and output formatting"],
    ["test", "Automated tests"],
    ["site", "Static product website"],
  ];
  return definitions
    .filter(([directory]) => hasPath(files, directory))
    .map(([path, description]) => ({ path, description }));
}

async function detectArchitecture(root, files, technologies, projectType) {
  const names = new Set(technologies.map((technology) => technology.name));
  const astroConfig = ["astro.config.mjs", "astro.config.ts", "astro.config.js"].find((file) => files.includes(file));
  const hasAstro = names.has("Astro") && astroConfig;
  if (!hasAstro) return detectCliArchitecture(root, files, projectType);
  const configText = await readText(root, astroConfig);
  const reactImport = configText.match(
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']@astrojs\/react["']/,
  );
  const integrationName = reactImport?.[1] ?? null;
  const configuredReact = Boolean(
    integrationName &&
      new RegExp(
        `\\bintegrations\\s*:\\s*\\[[\\s\\S]*?\\b${escapeRegExp(integrationName)}\\s*\\(`,
      ).test(configText),
  );
  const hydratedPage = configuredReact ? await findHydratedReactPage(root, files) : null;
  const hasReact = Boolean(
    names.has("React") && names.has("Astro React integration") && configuredReact && hydratedPage,
  );
  const hasPages = hasPath(files, "src/pages");
  return {
    summary: hasReact
      ? "Astro owns file-based routing, page documents, and the production build, while React powers interactive components through the Astro React integration."
      : hasPages
        ? "Astro owns file-based routing, page documents, and the production build."
        : "Astro provides the application framework and production build.",
    evidence: [
      astroConfig,
      ...(hasPages ? ["src/pages"] : []),
      ...(hasReact ? [hydratedPage, "@astrojs/react", "react"] : []),
    ],
  };
}

async function detectCliArchitecture(root, files, projectType) {
  if (projectType !== "cli" || !hasPath(files, "src/core")) return null;
  const cliFile = ["src/cli.js", "src/cli.ts"].find((file) => files.includes(file));
  if (!cliFile) return null;
  const source = await readText(root, cliFile);
  const coreStages = [
    "inspect-repository",
    "model",
    "render-readme",
    "validate-readme",
    "write-readme",
  ];
  if (!coreStages.every((stage) => source.includes(`/core/${stage}.js`))) return null;
  const hasTerminal = hasPath(files, "src/terminal");
  return {
    summary: [
      "The CLI coordinates repository inspection, README modeling, Markdown rendering and validation, and file output through reusable modules in `src/core`.",
      ...(hasTerminal
        ? ["Modules in `src/terminal` handle interactive prompts and terminal formatting."]
        : []),
    ].join(" "),
    evidence: [cliFile, "src/core", ...(hasTerminal ? ["src/terminal"] : [])],
  };
}

async function readText(root, relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findHydratedReactPage(root, files) {
  const astroPages = files.filter((file) => /^src\/pages\/.+\.astro$/i.test(file)).slice(0, 100);
  for (const file of astroPages) {
    const content = await readText(root, file);
    const componentNames = [
      ...content.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']+\.(?:jsx|tsx)["']/g),
    ].map((match) => match[1]);
    if (
      componentNames.some((name) =>
        new RegExp(
          `<${escapeRegExp(name)}\\b[^>]*\\bclient:(?:load|idle|visible|media|only)\\b`,
        ).test(content),
      )
    ) {
      return file;
    }
  }
  return null;
}

function parseNetlifyDeployment(text) {
  const buildSection = text.match(/^\s*\[build\]\s*$([\s\S]*?)(?=^\s*\[[^\]]+\]\s*$|(?![\s\S]))/im)?.[1] ?? "";
  const publishDirectory = buildSection.match(/^\s*publish\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/im)?.[1] ?? null;
  return { provider: "Netlify", configFile: "netlify.toml", publishDirectory };
}

async function detectDeployment(root, files) {
  if (!files.includes("netlify.toml")) return null;
  try {
    return parseNetlifyDeployment(await readFile(path.join(root, "netlify.toml"), "utf8"));
  } catch {
    return null;
  }
}

function detectPackageAuthor(packageJson) {
  const author = packageJson?.author;
  if (typeof author === "string") return author.trim() || null;
  if (author && typeof author === "object" && typeof author.name === "string") return author.name.trim() || null;
  return null;
}

export async function inspectRepository(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const files = await listFiles(root);
  const packageJson = await readJson(path.join(root, "package.json"));
  const git = await inspectGit(root, options.remoteUrl);
  const packageManager = detectPackageManager(files, packageJson);
  const projectType = detectProjectType(packageJson, files);
  const technologies = detectTechnologies(packageJson);
  const commands = detectCommands(packageManager, packageJson, projectType);
  const license = await inspectLicense(root, files, packageJson);
  const contributingFile =
    files.find((file) => /^contributing(?:\.[^/]+)?$/i.test(path.basename(file))) ?? null;
  const workflowFile =
    files.find((file) => /^\.github\/workflows\/.+\.ya?ml$/i.test(file)) ?? null;
  const repositoryName = git.remote?.repository ?? path.basename(root);
  const packageTitle = packageJson?.name?.split("/").at(-1);

  return {
    root,
    filesScanned: files.length,
    scanTruncated: files.length >= MAX_FILES,
    title: packageJson?.displayName ?? packageTitle ?? repositoryName,
    description: packageJson?.description ?? "",
    packageName: packageJson?.name ?? null,
    packageVersion: packageJson?.version ?? null,
    private: Boolean(packageJson?.private),
    projectType,
    packageAuthor: detectPackageAuthor(packageJson),
    packageManager,
    developmentCommand: `${packageManager} install`,
    installCommand: defaultInstallCommand(packageManager, packageJson),
    usageCommand: defaultUsageCommand(packageManager, packageJson, projectType),
    testCommand: packageJson?.scripts?.test ? `${packageManager} test` : null,
    runtime: packageJson?.engines?.node ?? null,
    scripts: packageJson?.scripts ?? {},
    commands,
    technologies,
    architecture: await detectArchitecture(root, files, technologies, projectType),
    projectStructure: detectProjectStructure(files),
    testing: (() => {
      const testCommands = commands.filter((command) => command.id === "check" || TEST_SCRIPT.test(command.id));
      return testCommands.length ? { commands: testCommands } : null;
    })(),
    deployment: await detectDeployment(root, files),
    binName:
      typeof packageJson?.bin === "string"
        ? packageJson.name
        : Object.keys(packageJson?.bin ?? {})[0] ?? null,
    languages: detectLanguages(files),
    demoPath: detectDemoPath(files),
    contributingFile,
    workflowFile,
    branch: git.branch,
    defaultBranch: git.defaultBranch,
    remoteUrl: git.remoteUrl,
    remote: git.remote,
    owner: git.remote?.owner ?? null,
    repository: repositoryName,
    repositoryUrl: git.remote?.webUrl ?? null,
    ...license,
  };
}
