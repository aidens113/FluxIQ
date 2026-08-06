import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(repositoryRoot, "docs");
const markdownFiles = await findMarkdownFiles(docsRoot);
const failures = [];

for (const file of markdownFiles) {
  const source = stripFencedCode(await readFile(file, "utf8"));
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1]?.trim() ?? "";
    const target = rawTarget.startsWith("<") && rawTarget.endsWith(">") ? rawTarget.slice(1, -1) : (rawTarget.split(/\s+["']/)[0] ?? "");
    if (!target || target.startsWith("#") || /^(https?:|mailto:|data:)/i.test(target)) continue;
    const withoutSuffix = target.split(/[?#]/, 1)[0] ?? "";
    if (!withoutSuffix) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(withoutSuffix);
    } catch {
      failures.push(`${relative(file)}: invalid URL encoding in link ${rawTarget}`);
      continue;
    }
    const resolved = path.resolve(path.dirname(file), decoded);
    if (!isInside(repositoryRoot, resolved)) {
      failures.push(`${relative(file)}: link escapes the repository: ${rawTarget}`);
      continue;
    }
    if (!(await linkTargetExists(resolved))) {
      failures.push(`${relative(file)}: missing local link target: ${rawTarget}`);
    }
  }
}

if (failures.length) {
  throw new Error(`Documentation validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
}
console.log(`Validated local links in ${markdownFiles.length} authored/reference Markdown files.`);

async function findMarkdownFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return findMarkdownFiles(entryPath);
      return entry.isFile() && /\.mdx?$/i.test(entry.name) ? [entryPath] : [];
    }),
  );
  return files.flat().sort();
}

async function linkTargetExists(target) {
  const info = await stat(target).catch(() => null);
  if (info?.isFile()) return true;
  if (!info?.isDirectory()) return false;
  return Boolean(await stat(path.join(target, "README.md")).catch(() => null));
}

function stripFencedCode(source) {
  return source.replace(/^```[\s\S]*?^```\s*$/gm, "");
}

function isInside(root, candidate) {
  const value = path.relative(root, candidate);
  return value === "" || (!value.startsWith("..") && !path.isAbsolute(value));
}

function relative(file) {
  return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}
