import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, copyFile } from "node:fs/promises";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "src", "core");
const targetDir = path.join(repoRoot, "docs", "core");

await mkdir(targetDir, { recursive: true });

const files = await readdir(sourceDir, { withFileTypes: true });
const copied = [];

for (const file of files) {
  if (!file.isFile() || !file.name.endsWith(".js")) {
    continue;
  }

  const srcPath = path.join(sourceDir, file.name);
  const destPath = path.join(targetDir, file.name);
  await copyFile(srcPath, destPath);
  copied.push(file.name);
}

console.log(`Synced ${copied.length} core modules to docs/core`);
for (const file of copied) {
  console.log(`- ${file}`);
}
