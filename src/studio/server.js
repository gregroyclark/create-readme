import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { studioSnapshot } from "./data.js";
import {
  MAX_JSON_BYTES,
  StudioRequestError,
  configText,
  digest,
  readStudioConfig,
  readStudioTarget,
  resolveStudioTargets,
  sameJson,
  validateOverrides,
  writeStudioTarget,
} from "./authoring.js";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);
const REVIEW_LIMIT = 100;

function errorMessage(error, fallback = "Could not complete the Studio request.") {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function readJsonBody(req) {
  const contentLength = req.headers["content-length"];
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_JSON_BYTES)) {
    throw new StudioRequestError(413, "Request body is too large.");
  }
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > MAX_JSON_BYTES) throw new StudioRequestError(413, "Request body is too large.");
    parts.push(part);
  }
  try {
    const body = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return body;
  } catch {
    throw new StudioRequestError(400, "Request body must be a JSON object.");
  }
}

function validateWriteRequest(body) {
  validateOverrides(body.overrides);
  if (typeof body.reviewId !== "string" || !/^[a-f0-9]{48}$/.test(body.reviewId)) {
    throw new StudioRequestError(400, "reviewId is required.");
  }
  if (typeof body.expectedRevision !== "string") throw new StudioRequestError(400, "expectedRevision is required.");
  if (body.confirm !== true) throw new StudioRequestError(400, "confirm must be true before writing.");
}

export async function startStudio({ root = process.cwd(), port = 0, configPath = "readme.config.json" } = {}) {
  const targets = await resolveStudioTargets(path.resolve(root), configPath);
  const token = randomBytes(24).toString("hex");
  const reviews = new Map();
  let origin;
  let commits = Promise.resolve();

  const serialized = (operation) => {
    const result = commits.then(operation, operation);
    commits = result.catch(() => {});
    return result;
  };

  const makeSnapshot = async (requestedOverrides, { review = true } = {}) => {
    const loaded = await readStudioConfig(targets.root, targets.config);
    const overrides = requestedOverrides === undefined ? loaded.overrides : requestedOverrides;
    const [readme, config] = await Promise.all([
      readStudioTarget(targets.root, targets.readme),
      readStudioTarget(targets.root, targets.config),
    ]);
    const snapshot = await studioSnapshot(targets.root, {
      overrides,
      configPath: targets.config.displayPath,
      configFound: config.exists,
      targets: { readme, config },
    });
    snapshot.generation = digest({ facts: snapshot.factsRevision, markdown: snapshot.markdown });
    if (review) {
      const reviewId = randomBytes(24).toString("hex");
      reviews.set(reviewId, {
        generation: snapshot.generation,
        markdown: snapshot.markdown,
        overrides,
        revisions: { readme: readme.revision, config: config.revision },
      });
      while (reviews.size > REVIEW_LIMIT) reviews.delete(reviews.keys().next().value);
      snapshot.reviewId = reviewId;
    }
    return snapshot;
  };

  // Fail before opening the browser when the configured target or repository cannot be inspected.
  await makeSnapshot(undefined, { review: false });

  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, body, type = "text/plain; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    const sendJson = (status, body) => send(status, JSON.stringify(body), "application/json; charset=utf-8");
    const sendApiError = (status, error) => sendJson(status, { error: errorMessage(error) });

    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
        return sendApiError(403, new Error("Forbidden"));
      }
      const isApi = ["/api/studio", "/api/preview", "/api/save-config", "/api/write-readme"].includes(req.url);
      if (isApi) {
        if (req.headers.authorization !== `Bearer ${token}`) return sendApiError(403, new Error("Open the complete Studio URL printed in your terminal."));
        if (req.url === "/api/studio" && req.method === "GET") return sendJson(200, await makeSnapshot());
        if (req.url === "/api/preview" && req.method === "POST") {
          const body = await readJsonBody(req);
          validateOverrides(body.overrides);
          return sendJson(200, await makeSnapshot(body.overrides));
        }
        if (["/api/save-config", "/api/write-readme"].includes(req.url) && req.method === "POST") {
          const body = await readJsonBody(req);
          validateWriteRequest(body);
          const kind = req.url === "/api/save-config" ? "config" : "readme";
          const target = targets[kind];
          const result = await serialized(async () => {
            const reviewed = reviews.get(body.reviewId);
            if (!reviewed || !sameJson(reviewed.overrides, body.overrides)) {
              throw new StudioRequestError(409, "This draft was not reviewed with these overrides. Preview it again before writing.");
            }
            if (reviewed.revisions[kind] !== body.expectedRevision) {
              throw new StudioRequestError(409, `${target.displayPath} is no longer at the reviewed revision.`);
            }
            const fresh = await makeSnapshot(body.overrides, { review: false });
            if (fresh.generation !== reviewed.generation || fresh.markdown !== reviewed.markdown) {
              throw new StudioRequestError(409, "Repository facts changed since this draft was reviewed. Preview it again before writing.");
            }
            if (kind === "readme" && fresh.errors.length) {
              throw new StudioRequestError(422, "Generated README did not pass validation.");
            }
            const content = kind === "config" ? configText(body.overrides) : fresh.markdown;
            const saved = { kind, path: target.displayPath };
            const write = await writeStudioTarget(targets.root, target, body.expectedRevision, content);
            try {
              const snapshot = await makeSnapshot(body.overrides);
              if (snapshot.targets[kind].revision !== write.revision) {
                return {
                  saved,
                  warning: `${target.displayPath} changed again after Studio saved it. Review the current file before another write.`,
                  ...snapshot,
                };
              }
              return { saved, ...snapshot };
            } catch (error) {
              const fallback = {
                ...fresh,
                reviewId: body.reviewId,
                ...(kind === "config" ? { config: target.displayPath } : {}),
                targets: {
                  ...fresh.targets,
                  [kind]: { path: target.displayPath, exists: true, content, revision: write.revision },
                },
              };
              return {
                saved,
                warning: `${target.displayPath} was saved, but Studio could not refresh its snapshot: ${errorMessage(error)}. Reload before another write.`,
                ...fallback,
              };
            }
          });
          return sendJson(200, result);
        }
        return sendApiError(405, new Error("Method not allowed"));
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.setHeader("Allow", "GET, HEAD");
        return send(405, "Method not allowed");
      }
      const asset = assets.get(req.url);
      if (!asset) return send(404, "Not found");
      return send(200, await readFile(new URL(`./public/${asset[0]}`, import.meta.url)), asset[1]);
    } catch (error) {
      if (["/api/studio", "/api/preview", "/api/save-config", "/api/write-readme"].includes(req.url)) {
        return sendApiError(error instanceof StudioRequestError ? error.status : 500, error);
      }
      return send(500, "Could not load Studio");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, url: `${origin}/#${token}`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

export function openStudio(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error("Browser launch failed")));
  });
}
