import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadConfig(root, configPath = "readme.config.json") {
  const absolutePath = path.resolve(root, configPath);
  try {
    const config = JSON.parse(await readFile(absolutePath, "utf8"));
    return { config, path: absolutePath, found: true };
  } catch (error) {
    if (error.code === "ENOENT") return { config: {}, path: absolutePath, found: false };
    if (error instanceof SyntaxError) {
      throw new Error(`Could not parse ${path.relative(root, absolutePath)}: ${error.message}`);
    }
    throw error;
  }
}

export async function saveConfig(config, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
