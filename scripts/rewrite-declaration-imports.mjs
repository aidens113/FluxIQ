import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve(process.argv[2] ?? "dist");

for (const filePath of await declarationFiles(outputRoot)) {
  const source = await readFile(filePath, "utf8");
  const rewritten = source.replace(
    /((?:from\s+|import\s*\()(["']))(\.\.?\/[^"']+)\.ts\2/g,
    (_match, prefix, quote, specifier) => `${prefix}${specifier}.js${quote}`
  );
  if (rewritten !== source) await writeFile(filePath, rewritten, "utf8");
}

async function declarationFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await declarationFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".d.ts")) files.push(target);
  }
  return files;
}
