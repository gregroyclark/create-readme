import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { studioSnapshot } from "./data.js";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);

export async function startStudio({ root = process.cwd(), port = 0, configPath = "readme.config.json" } = {}) {
  root = path.resolve(root);
  // Fail before opening the browser if inspection or configuration is invalid.
  await studioSnapshot(root, configPath);
  const token = randomBytes(24).toString("hex");
  let origin;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, body, type = "text/plain; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return send(403, "Forbidden");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      return send(405, "Read-only Studio");
    }
    try {
      if (req.url === "/api/studio") {
        if (req.headers.authorization !== `Bearer ${token}`) return send(403, "Open the complete Studio URL printed in your terminal.");
        const snapshot = await studioSnapshot(root, configPath);
        return send(200, JSON.stringify(snapshot), "application/json; charset=utf-8");
      }
      const asset = assets.get(req.url);
      if (!asset) return send(404, "Not found");
      return send(200, await readFile(new URL(`./public/${asset[0]}`, import.meta.url)), asset[1]);
    } catch (error) {
      return send(500, JSON.stringify({ error: req.url === "/api/studio" ? `Could not scan repository: ${error.message}` : "Could not load Studio" }), "application/json; charset=utf-8");
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
