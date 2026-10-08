import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The framework reference as Markdown, from TypeDoc's top-level reflections.
 *
 * Each declaration records its name, kind, owning file and summary, and nothing
 * that moves when unrelated lines move: no line numbers, no timestamps, no
 * machine paths. The reference therefore changes only when the public surface
 * does (an export added, removed, renamed, re-kinded, moved to another file, or
 * its summary rewritten), so a Core task that touches no export never makes it
 * stale and two tasks never conflict over it.
 */
export function frameworkReferenceMarkdown(reflections, repositoryRoot) {
  const declarations = reflections
    .map((reflection) => ({
      name: reflection.name,
      kind: kindName(reflection.kind),
      source: sourceFile(reflection, repositoryRoot),
      summary: commentSummary(reflection.comment),
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.kind.localeCompare(right.kind) ||
        left.source.localeCompare(right.source) ||
        left.summary.localeCompare(right.summary),
    );
  const counts = new Map();
  for (const declaration of declarations) counts.set(declaration.kind, (counts.get(declaration.kind) ?? 0) + 1);

  return [
    "# Framework API Reference",
    "",
    "This deterministic inventory is generated from the public exports of `packages/fluxiq/src/index.ts` using TypeDoc.",
    "It intentionally omits line numbers, timestamps, machine paths, Git state, and runtime data, so it changes only when the public surface changes.",
    "",
    "Regenerate it with `pnpm docs:reference`; CI verifies freshness with `pnpm docs:check`.",
    "",
    "## API Summary",
    "",
    `- Public declarations: ${declarations.length}`,
    ...[...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([kind, count]) => `- ${kind}: ${count}`),
    "",
    "## Public Declarations",
    "",
    "| Name | Kind | Source | Summary |",
    "| --- | --- | --- | --- |",
    ...declarations.map(
      (item) =>
        `| \`${escapeTable(item.name)}\` | ${escapeTable(item.kind)} | ${item.source ? `\`${escapeTable(item.source)}\`` : "-"} | ${escapeTable(item.summary || "-")} |`,
    ),
    "",
  ].join("\n");
}

function commentSummary(comment) {
  return (comment?.summary ?? [])
    .map((part) => part.text)
    .join("")
    .trim()
    .replace(/\s+/g, " ");
}

function sourceFile(reflection, repositoryRoot) {
  const source = Array.isArray(reflection.sources) ? reflection.sources[0] : undefined;
  if (!source?.fileName) return "";
  const absolute = path.isAbsolute(source.fileName) ? source.fileName : path.resolve(repositoryRoot, source.fileName);
  const relative = slash(path.relative(repositoryRoot, absolute));
  return relative.startsWith("../") ? slash(source.fileName) : relative;
}

function kindName(kind) {
  const names = {
    1: "Project",
    2: "Module",
    4: "Namespace",
    32: "Object",
    64: "Value",
    128: "Class",
    256: "Interface",
    512: "Constructor",
    1024: "Property",
    2048: "Method",
    4096: "Call Signature",
    8192: "Index Signature",
    16384: "Constructor Signature",
    32768: "Parameter",
    65536: "Type Literal",
    131072: "Type Parameter",
    262144: "Accessor",
    2097152: "Type",
    4194304: "Type Alias",
    8388608: "Variable",
    16777216: "Function",
  };
  return names[kind] ?? `Kind ${kind}`;
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function slash(value) {
  return value.replaceAll("\\", "/");
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputPath = path.join(repositoryRoot, "docs", "reference", "framework-reference.md");
  const packageOutputPath = path.join(repositoryRoot, "packages", "fluxiq", "docs", "reference", "framework-reference.md");
  const checkOnly = process.argv.includes("--check");
  if (checkOnly) process.argv = process.argv.filter((arg) => arg !== "--check");
  const packageRequire = createRequire(path.join(repositoryRoot, "packages", "fluxiq", "package.json"));
  const { Application, EntryPointStrategy } = await import(pathToFileURL(packageRequire.resolve("typedoc")).href);

  const app = await Application.bootstrap({
    name: "FluxIQ Framework API",
    entryPoints: [slash(path.join(repositoryRoot, "packages", "fluxiq", "src", "index.ts"))],
    entryPointStrategy: EntryPointStrategy.Resolve,
    tsconfig: slash(path.join(repositoryRoot, "packages", "fluxiq", "tsconfig.json")),
    readme: "none",
    excludePrivate: true,
    excludeProtected: true,
    excludeInternal: true,
    skipErrorChecking: true,
    plugin: [],
  });
  const project = await app.convert();
  if (!project) throw new Error("TypeDoc conversion did not produce a project reflection.");
  const reflections = project.children ?? [];
  const markdown = frameworkReferenceMarkdown(reflections, repositoryRoot);

  if (checkOnly) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    const packaged = await readFile(packageOutputPath, "utf8").catch(() => "");
    if (normalizeNewlines(current) !== normalizeNewlines(markdown)) {
      throw new Error("docs/reference/framework-reference.md is stale: the public surface changed. Run `pnpm docs:reference` and commit the result.");
    }
    if (normalizeNewlines(packaged) !== normalizeNewlines(markdown)) {
      throw new Error("packages/fluxiq/docs/reference/framework-reference.md is stale: the public surface changed. Run `pnpm docs:reference` and commit the result.");
    }
    console.log("Deterministic framework reference is current.");
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await mkdir(path.dirname(packageOutputPath), { recursive: true });
    await writeFile(outputPath, markdown, "utf8");
    await writeFile(packageOutputPath, markdown, "utf8");
    console.log(
      `Wrote ${slash(path.relative(repositoryRoot, outputPath))} and ${slash(path.relative(repositoryRoot, packageOutputPath))} (${reflections.length} public declarations).`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
