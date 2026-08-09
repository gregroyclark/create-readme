import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

  const scpMatch = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scpMatch && !value.includes("://")) {
    [, host, pathname] = scpMatch;
  } else {
    try {
      const parsed = new URL(value);
      host = parsed.hostname;
      pathname = parsed.pathname;
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

  const repository = segments.at(-1);
  const owner = segments.slice(0, -1).join("/");

  return {
    host,
    owner,
    repository,
    slug: `${owner}/${repository}`,
    webUrl: `https://${host}/${owner}/${repository}`,
    isGitHub: host.toLowerCase() === "github.com",
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
