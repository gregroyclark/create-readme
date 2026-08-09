import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PUBLIC_SSH_HOSTS = new Set([
  "bitbucket.org",
  "codeberg.org",
  "git.sr.ht",
  "github.com",
  "gitlab.com",
]);
const PUBLIC_GITHUB_ALIASES = new Set(["github.com-personal"]);

function publicSshHost(host) {
  const normalized = host.toLowerCase();
  if (PUBLIC_GITHUB_ALIASES.has(normalized)) {
    return "github.com";
  }
  return PUBLIC_SSH_HOSTS.has(normalized) ? normalized : null;
}

async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: 2_000,
      windowsHide: true,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function parseRemoteUrl(remoteUrl) {
  if (!remoteUrl || typeof remoteUrl !== "string") {
    return null;
  }

  const value = remoteUrl.trim();
  let host;
  let pathname;
  let restrictWebHost = false;

  const scpMatch = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scpMatch && !value.includes("://")) {
    [, host, pathname] = scpMatch;
    restrictWebHost = true;
  } else {
    try {
      const parsed = new URL(value);
      host = parsed.hostname;
      pathname = parsed.pathname;
      restrictWebHost = parsed.protocol.includes("ssh");
    } catch {
      return null;
    }
  }

  const segments = pathname
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);

  if (!host || segments.length < 2) {
    return null;
  }

  const webHost = restrictWebHost ? publicSshHost(host) : host;
  host = webHost ?? host;
  const repository = segments.at(-1);
  const owner = segments.slice(0, -1).join("/");

  return {
    host,
    owner,
    repository,
    slug: `${owner}/${repository}`,
    webUrl: webHost ? `https://${webHost}/${owner}/${repository}` : null,
    isGitHub: webHost?.toLowerCase() === "github.com",
  };
}

export async function inspectGit(root, remoteOverride) {
  const remoteUrl = remoteOverride ?? (await runGit(["config", "--get", "remote.origin.url"], root));
  const branch = await runGit(["branch", "--show-current"], root);
  const remoteHead = await runGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], root);

  return {
    branch,
    defaultBranch: remoteHead?.replace(/^origin\//, "") ?? null,
    remoteUrl,
    remote: parseRemoteUrl(remoteUrl),
  };
}
