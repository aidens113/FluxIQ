// The docs service: snapshots, rendering, source roots, and the generated reference.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BackgroundTasksService } from "../background-tasks/index.ts";
import { DatabaseManagerService } from "../database-manager/index.ts";
import { DeploymentSyncService } from "../deployment-sync/index.ts";
import { DocsService } from "../docs/index.ts";
import { registerGlobalDocumentationGenerators } from "../_shared/docs-generators.ts";
import { createGlobalProgramRuntime } from "../index.ts";

describe("global program services", () => {
  it("creates docs snapshots from registered sources", async () => {
    const service = new DocsService();
    service.registerSource({ id: "missing", title: "Missing", rootDir: "does-not-exist", scope: "framework" });

    const snapshot = await service.snapshot(1000);

    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.pages).toHaveLength(0);
  });

  it("renders markdown tables, code fences, links, and inline code", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-markdown-docs-"));
    try {
      await mkdir(path.join(root, "docs"), { recursive: true });
      await writeFile(path.join(root, "docs", "reference.md"), [
        "# Reference",
        "",
        "| Name | Kind |",
        "| --- | --- |",
        "| `FluxIQ` | Class |",
        "",
        "```ts",
        "const app = FluxIQ.create();",
        "```",
        "",
        "See [TypeDoc](./typedoc/index.html) and `createGlobalProgramRuntime`."
      ].join("\n"), "utf8");
      const service = new DocsService();
      service.registerSource({ id: "docs", title: "Docs", rootDir: path.join(root, "docs"), scope: "framework" });
      const snapshot = await service.rebuild();
      const page = await service.getPage(snapshot.pages[0]?.id ?? "");

      expect(page?.html).toContain("<table>");
      expect(page?.html).toContain("<pre><code class=\"language-ts\">");
      expect(page?.html).toContain("<a href=\"./typedoc/index.html\"");
      expect(page?.html).toContain("<code>createGlobalProgramRuntime</code>");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("renders generated HTML docs without dead interactive TypeDoc controls", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-html-docs-"));
    try {
      await mkdir(path.join(root, "docs"), { recursive: true });
      await writeFile(path.join(root, "docs", "typedoc.html"), [
        "<!doctype html><html><head><title>API</title></head><body>",
        "<script>window.bad = true</script>",
        "<img src=x onerror=alert(1)>",
        "<a href=javascript:alert(1)>Unsafe link</a>",
        "<iframe srcdoc=\"<script>window.bad = true</script>\"></iframe>",
        "<button id=\"tsd-search-trigger\">Search</button>",
        "<details open><summary><svg><use href=\"icon-chevronDown\"></use></svg>Classes</summary><p>FluxIQ</p></details>",
        "</body></html>"
      ].join(""), "utf8");
      const service = new DocsService();
      service.registerSource({ id: "docs", title: "Docs", rootDir: path.join(root, "docs"), scope: "framework" });
      const snapshot = await service.rebuild();
      const page = await service.getPage(snapshot.pages[0]?.id ?? "");

      expect(page?.html).toContain("<h1>API</h1>");
      expect(page?.html).toContain("<section");
      expect(page?.html).toContain("Classes");
      expect(page?.html).not.toContain("<details");
      expect(page?.html).not.toContain("<summary");
      expect(page?.html).not.toContain("<svg");
      expect(page?.html).not.toContain("<button");
      expect(page?.html).not.toContain("<script");
      expect(page?.html).not.toMatch(/onerror/i);
      expect(page?.html).not.toMatch(/javascript:/i);
      expect(page?.html).not.toContain("<iframe");
      expect(page?.format).toBe("html");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects docs sources outside configured roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-docs-boundary-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "fluxiq-docs-outside-"));
    try {
      const docsRoot = path.join(root, "docs");
      await mkdir(docsRoot, { recursive: true });
      const service = new DocsService({ docsRootDir: docsRoot });

      expect(() => service.registerSource({
        id: "outside",
        title: "Outside",
        rootDir: outside,
        scope: "framework"
      })).toThrow("Documentation source must be inside an allowed docs root");

      await expect(service.upsertSource({
        id: "outside",
        title: "Outside",
        rootDir: outside,
        scope: "framework"
      })).rejects.toThrow("Documentation source must be inside an allowed docs root");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("writes runtime documentation into the ignored host cache without mutating authored docs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-docs-"));
    try {
      const runtime = createGlobalProgramRuntime({
        root,
        fluxiq: path.join(root, ".fluxiq"),
        config: path.join(root, ".fluxiq", "config"),
        data: path.join(root, ".fluxiq", "data"),
        databases: path.join(root, ".fluxiq", "databases"),
        inputs: path.join(root, ".fluxiq", "inputs"),
        outputs: path.join(root, ".fluxiq", "outputs"),
        streams: path.join(root, ".fluxiq", "streams"),
        domains: path.join(root, ".fluxiq", "domains"),
        domainPrograms: path.join(root, ".fluxiq", "domains", "programs"),
        domainInputs: path.join(root, ".fluxiq", "domains", "inputs"),
        domainOutputs: path.join(root, ".fluxiq", "domains", "outputs"),
        domainConfigs: path.join(root, ".fluxiq", "domains", "configs"),
        domainData: path.join(root, ".fluxiq", "domains", "data"),
        domainDatabases: path.join(root, ".fluxiq", "domains", "databases"),
        recordings: path.join(root, ".fluxiq", "recordings"),
        policies: path.join(root, ".fluxiq", "policies"),
        logs: path.join(root, ".fluxiq", "logs"),
        temp: path.join(root, ".fluxiq", "tmp")
      });

      const snapshot = await runtime.docs.rebuild(1000);
      const catalog = await readFile(path.join(root, ".fluxiq", "cache", "docs", "programs", "catalog.md"), "utf8");
      const apiMap = await readFile(path.join(root, ".fluxiq", "cache", "docs", "programs", "api-map.md"), "utf8");
      const reference = await readFile(path.join(root, ".fluxiq", "cache", "docs", "reference", "framework-reference.md"), "utf8");

      expect(snapshot.generatedPages).toBeGreaterThan(0);
      expect(snapshot.sources.map((source) => source.id)).toEqual(["framework-docs", "runtime-docs"]);
      expect(snapshot.pages.some((page) => page.sourceId === "runtime-docs" && page.routePath === "/runtime-docs/programs/catalog")).toBe(true);
      expect(snapshot.pages.some((page) => page.sourceId === "runtime-docs" && page.routePath === "/runtime-docs/reference/framework-reference")).toBe(true);
      await expect(stat(path.join(root, "docs", "generated"))).rejects.toThrow();
      expect(catalog).toContain("# Program Catalog");
      expect(apiMap).toContain("background-tasks");
      expect(reference).toContain("# Framework API Reference");
      expect(reference).toContain("Runtime Cache Note");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("generates a TypeDoc-backed framework reference", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-typedoc-docs-"));
    try {
      const docs = new DocsService({
        docsRootDir: root,
        generatedRootDir: path.join(root, "generated")
      });
      registerGlobalDocumentationGenerators({
        docs,
        api: createGlobalProgramRuntime().api,
        backgroundTasks: new BackgroundTasksService(),
        databaseManager: new DatabaseManagerService(),
        deploymentSync: new DeploymentSyncService(),
        rootDir: path.resolve(process.cwd(), "../..")
      });

      await docs.rebuild(1000);
      const reference = await readFile(path.join(root, "generated", "reference", "framework-reference.md"), "utf8");
      const model = await readFile(path.join(root, "generated", "reference", "typedoc.json"), "utf8");

      expect(reference).toContain("This page is generated from TypeDoc reflection data");
      expect(reference).toContain("## TypeDoc Artifacts");
      expect(reference).toContain("## Public Declarations");
      expect(model).toContain("FluxIQ Framework API");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

});
