import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeReadme(markdown, outputPath) {
  const absolutePath = path.resolve(outputPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, markdown, "utf8");
  return absolutePath;
}
