import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JSONOutput } from "typedoc";
import type { IoSnapshot } from "../../io/index.ts";
import type { DomainRegistration } from "../../domains/index.ts";
import type { BackgroundTasksService } from "../background-tasks/index.ts";
import type { DatabaseManagerService } from "../database-manager/index.ts";
import type { DeploymentSyncService } from "../deployment-sync/index.ts";
import type { DocsService, GeneratedDocumentationPage } from "../docs/index.ts";
import { GLOBAL_PROGRAMS } from "./catalog.ts";
import type { GlobalProgramApiRegistry } from "./api.ts";

export type DocumentationRuntimeProviders = {
  domains?(): DomainRegistration[];
  io?(): IoSnapshot;
};

export function registerGlobalDocumentationGenerators(params: {
  docs: DocsService;
  api: GlobalProgramApiRegistry;
  backgroundTasks: BackgroundTasksService;
  databaseManager: DatabaseManagerService;
  deploymentSync: DeploymentSyncService;
  rootDir: string;
}): void {
  const { docs, api, backgroundTasks, databaseManager, deploymentSync, rootDir } = params;
  docs
    .registerGenerator({
      id: "generated-index",
      title: "Generated Docs Index",
      generate: ({ nowMs }) => [{
        relativePath: "index.md",
        markdown: [
          "# Runtime Documentation Snapshot",
          "",
          "These ephemeral pages are generated from the active importing repository and live FluxIQ runtime.",
          "They are rebuildable operator state under `.fluxiq/cache/docs` and must not be committed as authored documentation.",
          "",
          `Generated at: ${new Date(nowMs).toISOString()}`,
          "",
          "## Pages",
          "- [Platform Map](platform/map.md)",
          "- [Program Catalog](programs/catalog.md)",
          "- [Program API Map](programs/api-map.md)",
          "- [Database Inventory](data/databases.md)",
          "- [Background Tasks](operations/background-tasks.md)",
          "- [Deployment Sync](operations/deployment-sync.md)",
          "- [Inputs And Outputs](io/inputs-and-outputs.md)",
          "- [Host Domains](domains/host-domains.md)",
          "- [Framework Reference](reference/framework-reference.md)"
        ].join("\n")
      }]
    })
    .registerGenerator({
      id: "platform-map",
      title: "Platform Map",
      generate: async ({ nowMs }) => [{
        relativePath: "platform/map.md",
        markdown: [
          "# Platform Map",
          "",
          "This page is generated from the current FluxIQ runtime.",
          "",
          "## Counts",
          `- Global programs: ${GLOBAL_PROGRAMS.length}`,
          `- API endpoints: ${api.endpoints().length}`,
          `- Databases: ${(await databaseManager.snapshot()).databases.length}`,
          `- Background tasks: ${(await backgroundTasks.snapshot()).tasks.length}`,
          `- Generated at: ${new Date(nowMs).toISOString()}`,
          "",
          "## Runtime Roots",
          `- Repository root: \`${slash(path.resolve(rootDir))}\``,
          `- Docs root: \`${slash(path.resolve(rootDir, "docs"))}\``
        ].join("\n")
      }]
    })
    .registerGenerator({
      id: "program-catalog",
      title: "Program Catalog",
      generate: () => [{
        relativePath: "programs/catalog.md",
        markdown: [
          "# Program Catalog",
          "",
          "This page is generated from the global FluxIQ program catalog.",
          "",
          "| Program | Category | Description |",
          "| --- | --- | --- |",
          ...GLOBAL_PROGRAMS.map((program) => `| \`${escapeTable(program.id)}\` | ${escapeTable(program.category)} | ${escapeTable(program.description)} |`)
        ].join("\n")
      }]
    })
    .registerGenerator({
      id: "api-map",
      title: "Program API Map",
      generate: () => [{
        relativePath: "programs/api-map.md",
        markdown: [
          "# Program API Map",
          "",
          "This page is generated from the global program API registry.",
          "",
          "| Program | Endpoint | Permission |",
          "| --- | --- | --- |",
          ...api.endpoints()
            .sort((left, right) => `${left.programId}/${left.endpoint}`.localeCompare(`${right.programId}/${right.endpoint}`))
            .map((endpoint) => `| \`${escapeTable(endpoint.programId)}\` | \`${escapeTable(endpoint.endpoint)}\` | \`${escapeTable(endpoint.permission)}\` |`)
        ].join("\n")
      }]
    })
    .registerGenerator({
      id: "database-inventory",
      title: "Database Inventory",
      generate: async () => {
        const snapshot = await databaseManager.snapshot();
        return [{
          relativePath: "data/databases.md",
          markdown: [
            "# Database Inventory",
            "",
            "This page is generated from the Database Manager program.",
            "",
            "## Databases",
            ...bulletList(snapshot.databases.map((database) => `\`${database}\``)),
            "",
            "## Stores",
            "| Store | Scope | Records |",
            "| --- | --- | ---: |",
            ...snapshot.stores.map((store) => `| \`${escapeTable(store.kind)}\` | ${escapeTable(store.scope.domainId ?? "global")} | ${store.recordCount} |`)
          ].join("\n")
        }];
      }
    })
    .registerGenerator({
      id: "background-tasks",
      title: "Background Tasks",
      generate: async ({ nowMs }) => {
        const snapshot = await backgroundTasks.snapshot();
        return [{
          relativePath: "operations/background-tasks.md",
          markdown: [
            "# Background Tasks",
            "",
            "This page is generated from the Background Tasks program.",
            "",
            "## Scheduler",
            `- Running: ${snapshot.scheduler.running ? "yes" : "no"}`,
            `- Poll interval: ${snapshot.scheduler.pollIntervalMs}ms`,
            `- Generated at: ${new Date(nowMs).toISOString()}`,
            "",
            "## Tasks",
            "| Task | Queue | Enabled | Schedule | Next Run | Last Run |",
            "| --- | --- | --- | --- | --- | --- |",
            ...snapshot.tasks.map((task) => `| \`${escapeTable(task.id)}\` ${escapeTable(task.name)} | ${escapeTable(task.queue)} | ${task.enabled ? "yes" : "no"} | ${escapeTable(task.schedule ?? duration(task.intervalMs))} | ${time(task.nextRunAtMs)} | ${time(task.lastRunAtMs)} |`),
            "",
            "## Recent Runs",
            "| Run | Task | Status | Queued | Finished |",
            "| --- | --- | --- | --- | --- |",
            ...snapshot.runs.slice(0, 25).map((run) => `| \`${escapeTable(run.id.slice(0, 8))}\` | \`${escapeTable(run.taskId)}\` | ${escapeTable(run.status)} | ${time(run.queuedAtMs)} | ${time(run.finishedAtMs)} |`)
          ].join("\n")
        }];
      }
    })
    .registerGenerator({
      id: "deployment-sync",
      title: "Deployment Sync",
      generate: async () => {
        const snapshot = await deploymentSync.snapshot();
        return [{
          relativePath: "operations/deployment-sync.md",
          markdown: [
            "# Deployment Sync",
            "",
            "This page is generated from the Deployment Sync program.",
            "",
            "## Git",
            `- Available: ${snapshot.git?.available ? "yes" : "no"}`,
            `- Current branch: ${snapshot.git?.currentBranch ?? "-"}`,
            `- HEAD: ${snapshot.git?.headSha ?? "-"}`,
            `- Working tree: ${snapshot.git?.dirty ? "dirty" : "clean"}`,
            "",
            "## Targets",
            "| Target | Environment | Status | Branch | SHA |",
            "| --- | --- | --- | --- | --- |",
            ...snapshot.targets.map((target) => `| \`${escapeTable(target.id)}\` ${escapeTable(target.name)} | ${escapeTable(target.environment)} | ${escapeTable(target.status)} | ${escapeTable(String(target.metadata?.branch ?? "-"))} | ${escapeTable(String(target.metadata?.sha ?? "-").slice(0, 12))} |`),
            "",
            "## Versions",
            "| Version | Refs | Author | Committed | Message |",
            "| --- | --- | --- | --- | --- |",
            ...(snapshot.git?.versions ?? []).slice(0, 50).map((version) => `| \`${escapeTable(version.shortSha)}\` | ${escapeTable(version.refs.join(", ") || "-")} | ${escapeTable(version.author)} | ${time(version.committedAtMs)} | ${escapeTable(version.message)} |`)
          ].join("\n")
        }];
      }
    })
    .registerGenerator({
      id: "framework-reference",
      title: "Framework Reference",
      generate: async ({ generatedRootDir, nowMs }) => [{
        relativePath: "reference/framework-reference.md",
        markdown: await frameworkReference(rootDir, generatedRootDir, nowMs)
      }]
    });
}

export function registerHostDocumentationGenerators(params: {
  docs: DocsService;
  providers: Required<DocumentationRuntimeProviders>;
}): void {
  const { docs, providers } = params;
  docs
    .registerGenerator({
      id: "io-contracts",
      title: "Inputs And Outputs",
      generate: () => {
        const snapshot = providers.io();
        return [{
          relativePath: "io/inputs-and-outputs.md",
          markdown: [
            "# Inputs And Outputs",
            "",
            "This page is generated from the host project's registered FluxIQ IO adapters.",
            "",
            "## Inputs",
            "| Domain | Input | Role | Output binding | Mode | Description |",
            "| --- | --- | --- | --- | --- |",
            ...snapshot.inputs.map((input) => `| ${escapeTable(input.domainId ?? "global")} | \`${escapeTable(input.ioId)}\` ${escapeTable(input.title)} | ${escapeTable(input.role ?? "state")} | ${input.outputId ? `\`${escapeTable(input.outputId)}\`` : "-"} | ${escapeTable(input.mode)} | ${escapeTable(input.description ?? "-")} |`),
            "",
            "## Outputs",
            "| Domain | Output | Safety | Capabilities | Mode | Description |",
            "| --- | --- | --- | --- | --- |",
            ...snapshot.outputs.map((output) => `| ${escapeTable(output.domainId ?? "global")} | \`${escapeTable(output.ioId)}\` ${escapeTable(output.title)} | ${escapeTable(output.safety?.level ?? "-")} | ${escapeTable(output.capabilities?.join(", ") ?? "-")} | ${escapeTable(output.mode)} | ${escapeTable(output.description ?? "-")} |`)
          ].join("\n")
        }];
      }
    })
    .registerGenerator({
      id: "host-domains",
      title: "Host Domains",
      generate: () => {
        const domains = providers.domains();
        return [{
          relativePath: "domains/host-domains.md",
          markdown: [
            "# Host Domains",
            "",
            "This page is generated from domains registered by the importing project. FluxIQ itself does not ship domain-specific code.",
            "",
            "| Domain | Category | Status | Inputs | Outputs | Description |",
            "| --- | --- | --- | ---: | ---: | --- |",
            ...domains.map((domain) => `| \`${escapeTable(domain.manifest.id)}\` ${escapeTable(domain.manifest.title)} | ${escapeTable(domain.manifest.category)} | ${escapeTable(domain.manifest.status ?? "available")} | ${domain.manifest.inputs?.length ?? 0} | ${domain.manifest.outputs?.length ?? 0} | ${escapeTable(domain.manifest.description)} |`)
          ].join("\n")
        }];
      }
    });
}

const packageRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packagedFrameworkReferencePath = path.join(packageRootDir, "docs", "reference", "framework-reference.md");

async function frameworkReference(rootDir: string, generatedRootDir: string, nowMs: number): Promise<string> {
  const entryPoint = path.join(rootDir, "packages", "fluxiq", "src", "index.ts");
  const tsconfig = path.join(rootDir, "packages", "fluxiq", "tsconfig.json");
  const htmlDir = path.join(generatedRootDir, "reference", "typedoc");
  const jsonPath = path.join(generatedRootDir, "reference", "typedoc.json");
  const entryPointInfo = await stat(entryPoint).catch(() => null);
  if (!entryPointInfo?.isFile()) {
    return (await packagedFrameworkReference("FluxIQ source files are not present in the importing repository."))
      ?? await fallbackFrameworkReference(rootDir, "TypeDoc entry point was not found.");
  }
  try {
    const { Application, EntryPointStrategy } = await import("typedoc");
    const app = await Application.bootstrap({
      name: "FluxIQ Framework API",
      entryPoints: [slash(entryPoint)],
      entryPointStrategy: EntryPointStrategy.Resolve,
      tsconfig: slash(tsconfig),
      readme: "none",
      excludePrivate: true,
      excludeProtected: true,
      excludeInternal: true,
      skipErrorChecking: true,
      plugin: []
    });
    const project = await app.convert();
    if (!project) throw new Error("TypeDoc conversion did not produce a project reflection.");
    await rm(htmlDir, { recursive: true, force: true });
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await app.generateDocs(project, htmlDir);
    await app.generateJson(project, jsonPath);
    const model = JSON.parse(await readFile(jsonPath, "utf8")) as JSONOutput.ProjectReflection;
    return typedocReferenceMarkdown(model, {
      generatedAtMs: nowMs,
      htmlPath: ".fluxiq/cache/docs/reference/typedoc/index.html",
      jsonPath: ".fluxiq/cache/docs/reference/typedoc.json"
    });
  } catch (error) {
    return (await packagedFrameworkReference(`TypeDoc generation failed: ${error instanceof Error ? error.message : String(error)}`))
      ?? await fallbackFrameworkReference(rootDir, `TypeDoc generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function packagedFrameworkReference(reason: string): Promise<string | undefined> {
  const reference = await readFile(packagedFrameworkReferencePath, "utf8").catch(() => undefined);
  if (!reference) return undefined;
  return [
    reference.trimEnd(),
    "",
    "## Runtime Cache Note",
    "",
    "This runtime copy uses the deterministic framework reference packaged with `fluxiq`.",
    `Reason: ${reason}`,
    "",
    "Live TypeDoc HTML and JSON artifacts are generated only when FluxIQ source files and TypeDoc are available in this repository."
  ].join("\n");
}

function typedocReferenceMarkdown(model: JSONOutput.ProjectReflection, params: { generatedAtMs: number; htmlPath: string; jsonPath: string }): string {
  const declarations = collectTypeDocDeclarations(model).sort((left, right) => left.name.localeCompare(right.name));
  const groups = groupByKind(declarations);
  return [
    "# Framework Reference",
    "",
    "This page is generated from TypeDoc reflection data for `packages/fluxiq/src/index.ts`.",
    "",
    `Generated at: ${new Date(params.generatedAtMs).toISOString()}`,
    "",
    "## TypeDoc Artifacts",
    `- HTML site: \`${params.htmlPath}\``,
    `- JSON model: \`${params.jsonPath}\``,
    "",
    "## API Summary",
    `- Reflections: ${declarations.length}`,
    `- Public declarations shown: ${declarations.length}`,
    ...[...groups.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([kind, items]) => `- ${kind}: ${items.length}`),
    "",
    "## Public Declarations",
    "| Name | Kind | Source | Summary |",
    "| --- | --- | --- | --- |",
    ...tableRows(declarations.map((item) => [
      `\`${item.name}\``,
      item.kindString ?? "-",
      item.source ? `\`${item.source}\`` : "-",
      item.summary || "-"
    ]))
  ].join("\n");
}

type TypeDocDeclarationSummary = {
  name: string;
  kindString?: string;
  summary?: string;
  source?: string;
};

function collectTypeDocDeclarations(root: JSONOutput.ProjectReflection): TypeDocDeclarationSummary[] {
  return (root.children ?? []).map((reflection) => {
    const item: TypeDocDeclarationSummary = {
      name: reflection.name,
      kindString: typedocKindName(reflection.kind)
    };
    const summary = reflection.comment ? commentSummary(reflection.comment) : "";
    if (summary) item.summary = summary;
    const source = sourceSummary(reflection);
    if (source) item.source = source;
    return item;
  });
}

function typedocKindName(kind: number): string {
  const names: Record<number, string> = {
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
    4194304: "Type Alias",
    2097152: "Type",
    8388608: "Variable",
    16777216: "Function"
  };
  return names[kind] ?? `Kind ${kind}`;
}

function groupByKind(items: TypeDocDeclarationSummary[]): Map<string, TypeDocDeclarationSummary[]> {
  const groups = new Map<string, TypeDocDeclarationSummary[]>();
  for (const item of items) {
    const key = item.kindString ?? "Unknown";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function commentSummary(comment: JSONOutput.Comment): string {
  const text = comment.summary?.map((part) => part.text).join("").trim() ?? "";
  return text.replace(/\s+/g, " ");
}

function sourceSummary(reflection: JSONOutput.SomeReflection): string | undefined {
  if (!("sources" in reflection) || !Array.isArray(reflection.sources) || !reflection.sources[0]) return undefined;
  const source = reflection.sources[0];
  return source.line ? `${slash(source.fileName)}:${source.line}` : slash(source.fileName);
}

function tableRows(rows: string[][]): string[] {
  return rows.length ? rows.map((row) => `| ${row.map(escapeTable).join(" | ")} |`) : ["| - | - |"];
}

async function fallbackFrameworkReference(rootDir: string, reason: string): Promise<string> {
  const srcRoot = path.join(rootDir, "packages", "fluxiq", "src");
  const files = await typeScriptFiles(srcRoot);
  const exports = await Promise.all(files.map(async (file) => exportedSymbols(srcRoot, file)));
  return [
    "# Framework Reference",
    "",
    "TypeDoc could not generate the API reference for this rebuild.",
    "",
    `Reason: ${reason}`,
    "",
    "## Fallback Export Index",
    "",
    ...exports.flat().map((item) => `- \`${item.symbol}\` from \`${item.file}\``)
  ].join("\n");
}

async function typeScriptFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return typeScriptFiles(entryPath);
      if (!entry.isFile() || !/\.ts$/i.test(entry.name) || /\.test\.ts$/i.test(entry.name)) return [];
      return [entryPath];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

async function exportedSymbols(srcRoot: string, file: string): Promise<Array<{ file: string; symbol: string }>> {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return [];
  const source = await readFile(file, "utf8");
  const relative = slash(path.relative(srcRoot, file));
  const symbols = [...source.matchAll(/export\s+(?:type|class|function|const|interface|enum)\s+([A-Za-z0-9_]+)/g)].flatMap((match) => match[1] ? [match[1]] : []);
  return symbols.map((symbol) => ({ file: relative, symbol }));
}

function bulletList(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- None"];
}

function duration(value: unknown): string {
  if (typeof value !== "number" || value <= 0) return "-";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.round(hours / 24)} days`;
}

function time(value: unknown): string {
  return typeof value === "number" && value > 0 ? new Date(value).toISOString() : "-";
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function slash(value: string): string {
  return value.replaceAll("\\", "/");
}
