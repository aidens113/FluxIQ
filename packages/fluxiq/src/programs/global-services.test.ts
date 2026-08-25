import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BackgroundTasksService } from "./background-tasks/index.ts";
import { AutomationStudioService } from "./automation-studio/index.ts";
import { ComputeControlService } from "./compute-control/index.ts";
import { DatabaseManagerService, SQLiteRepository, createRecord } from "./database-manager/index.ts";
import { DeploymentSyncService } from "./deployment-sync/index.ts";
import { DocsService } from "./docs/index.ts";
import { registerGlobalDocumentationGenerators } from "./_shared/docs-generators.ts";
import { IdentityAccessService, TotpRequiredError } from "./identity-access/index.ts";
import { createGlobalProgramRuntime } from "./index.ts";
import type { ProgramApiActor } from "./_shared/api.ts";
import { ProductionRunnerService } from "./production-runner/index.ts";

describe("global program services", () => {
  it("registers global program API endpoints", () => {
    const runtime = createGlobalProgramRuntime();
    const endpoints = runtime.api.endpoints().map((endpoint) => `${endpoint.programId}/${endpoint.endpoint}`);

    expect(endpoints).toContain("automation-studio/snapshot");
    expect(endpoints).toContain("identity-access/snapshot");
    expect(endpoints).toContain("secret-keys/snapshot");
    expect(endpoints).toContain("secret-keys/create-key");
    expect(endpoints).toContain("database-manager/snapshot");
    expect(endpoints).toContain("background-tasks/snapshot");
    expect(endpoints).toContain("compute-control/snapshot");
    expect(endpoints).toContain("deployment-sync/snapshot");
    expect(endpoints).toContain("docs/snapshot");
    expect(endpoints).toContain("production-runner/snapshot");
  });

  it("seeds docs rebuild as a 24 hour background task", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-runtime-"));
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
      const task = (await runtime.backgroundTasks.snapshot()).tasks.find((item) => item.id === "docs.rebuild");

      expect(task?.intervalMs).toBe(86_400_000);
      expect(task?.schedule).toBe("Every 24 hours");
      expect(task?.nextRunAtMs).toBeGreaterThan(Date.now());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs background tasks through the service", async () => {
    const service = new BackgroundTasksService();
    service.register({ id: "refresh", name: "Refresh", queue: "default", enabled: true }, () => ({ ok: true }));

    const run = await service.run("refresh", undefined, 1000);

    expect(run.status).toBe("succeeded");
    expect((await service.snapshot()).runs).toHaveLength(1);
  });

  it("starts the background scheduler by default and persists controls", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-background-tasks-"));
    try {
      const first = new BackgroundTasksService({ repository: new SQLiteRepository({ rootDir: root, kind: "background.tasks" }), pollIntervalMs: 60_000 });
      first.register({ id: "refresh", name: "Refresh", queue: "default", enabled: true, intervalMs: 60_000, nextRunAtMs: 1000 });

      expect((await first.snapshot()).scheduler.running).toBe(true);
      const disabled = await first.setEnabled("refresh", false);
      expect(disabled.enabled).toBe(false);
      expect((await first.stop()).scheduler.running).toBe(false);
      await first.flushPendingWrites();

      const second = new BackgroundTasksService({ repository: new SQLiteRepository({ rootDir: root, kind: "background.tasks" }), pollIntervalMs: 60_000 });
      second.register({ id: "refresh", name: "Refresh", queue: "default", enabled: true, intervalMs: 60_000, nextRunAtMs: 1000 });
      const resumed = await second.snapshot();

      expect(resumed.scheduler.running).toBe(false);
      expect(resumed.tasks.find((task) => task.id === "refresh")?.enabled).toBe(false);

      await second.start();
      const enabled = await second.setEnabled("refresh", true);
      await second.flushPendingWrites();

      expect(enabled.enabled).toBe(true);
      expect(enabled.nextRunAtMs).toBeTypeOf("number");
      expect((await second.snapshot()).scheduler.running).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists registered background task countdown state on first load", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-background-countdown-"));
    try {
      const nextRunAtMs = Date.now() + 86_400_000;
      const first = new BackgroundTasksService({ repository: new SQLiteRepository({ rootDir: root, kind: "background.tasks" }), pollIntervalMs: 60_000 });
      first.register({ id: "docs.rebuild", name: "Rebuild Documentation Cache", queue: "maintenance", enabled: true, intervalMs: 86_400_000, nextRunAtMs });

      const firstTask = (await first.snapshot()).tasks.find((task) => task.id === "docs.rebuild");
      expect(firstTask?.nextRunAtMs).toBe(nextRunAtMs);
      await first.flushPendingWrites();
      expect((await new SQLiteRepository({ rootDir: root, kind: "background.tasks" }).list({})).map((record) => record.id)).toContain("task:docs.rebuild");

      const second = new BackgroundTasksService({ repository: new SQLiteRepository({ rootDir: root, kind: "background.tasks" }), pollIntervalMs: 60_000 });
      second.register({ id: "docs.rebuild", name: "Rebuild Documentation Cache", queue: "maintenance", enabled: true, intervalMs: 86_400_000, nextRunAtMs: Date.now() + 86_400_000 });

      const secondTask = (await second.snapshot()).tasks.find((task) => task.id === "docs.rebuild");
      expect(secondTask?.nextRunAtMs).toBe(nextRunAtMs);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("batches background task state writes until the flush window", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-background-batch-"));
    try {
      const repository = new SQLiteRepository({ rootDir: root, kind: "background.tasks" });
      const service = new BackgroundTasksService({ repository, pollIntervalMs: 60_000, stateWriteIntervalMs: 10_000 });
      service.register({ id: "refresh", name: "Refresh", queue: "default", enabled: true, intervalMs: 60_000, nextRunAtMs: 1000 });

      await service.snapshot();
      await service.setEnabled("refresh", false);

      const beforeFlush = (await repository.get("task:refresh", {}))?.data.task as { enabled?: boolean } | undefined;
      expect(beforeFlush?.enabled).toBe(true);

      await service.flushPendingWrites();

      const afterFlush = (await repository.get("task:refresh", {}))?.data.task as { enabled?: boolean } | undefined;
      expect(afterFlush?.enabled).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("tracks compute nodes, commands, and leases", async () => {
    const service = new ComputeControlService();
    await service.upsertNode({ id: "local", label: "Local", status: "online", domainIds: [], capabilities: ["flows"] });

    await service.enqueueCommand({ targetComputeId: "local", kind: "pause", nowMs: 1000 });
    await service.acquireLease({ computeId: "local", holder: "test", purpose: "run", ttlMs: 1000, nowMs: 1000 });

    const snapshot = await service.snapshot(1000);
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.commands).toHaveLength(1);
    expect(snapshot.leases).toHaveLength(1);
  });

  it("summarizes database repositories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-programs-"));
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      const service = new DatabaseManagerService().registerRepository("widgets", repo);

      await repo.put(createRecord({ id: "alpha", kind: "widgets", data: { name: "Alpha" }, nowMs: 1000 }));

      expect((await service.snapshot()).stores[0]?.recordCount).toBe(1);
      expect((await service.snapshot()).databases).toContain("global");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires fresh credential recheck before database manager exposes identity records", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-sensitive-db-"));
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
      const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });

      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "identity.users", authSessionId: login.session.id }
      })).resolves.toMatchObject({ ok: false, requiresRecheck: true });

      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "identity.users", authSessionId: login.session.id, authorizationPassword: "admin" }
      })).resolves.toMatchObject({ ok: true });

      await runtime.api.call({
        programId: "secret-keys",
        endpoint: "create-key",
        scope: {},
        actor: actorFor(login),
        payload: { name: "LLM", value: "sk-hidden", authSessionId: login.session.id, authorizationPassword: "admin" }
      });
      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "secret.keys", authSessionId: login.session.id }
      })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "secret.keys", authSessionId: login.session.id, authorizationPassword: "admin" }
      })).resolves.toMatchObject({ ok: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("syncs deployment targets through an adapter", async () => {
    const service = new DeploymentSyncService({ sync: () => "synced" });
    await service.upsertTarget({ id: "prod", name: "Production", environment: "prod", status: "idle" });

    const run = await service.sync("prod");

    expect(run.status).toBe("synced");
    expect((await service.snapshot()).targets.find((target) => target.id === "prod")?.status).toBe("synced");
  });

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
  });

  it("manages identity users and sessions", async () => {
    const service = new IdentityAccessService();
    const user = (await service.snapshot(1000)).users.find((item) => item.id === "admin");

    expect(user?.username).toBe("admin");
    const session = await service.createSession(user?.id ?? "", undefined, 1000);

    expect(session.expiresAtMs).toBe(1000 + 12 * 60 * 60 * 1000);
    expect((await service.snapshot(1000)).sessions).toHaveLength(1);
  });

  it("authenticates the default admin and verifies privileged credentials", async () => {
    const service = new IdentityAccessService();
    const login = await service.authenticate({ username: "admin", password: "admin" });

    expect(login.user.roleId).toBe("admin");
    expect(await service.validateSession(login.session.id)).not.toBeNull();
    await expect(service.authorizeSessionCredentials({
      sessionId: login.session.id,
      password: "admin",
      pin: undefined,
      totp: undefined
    })).resolves.toMatchObject({ username: "admin" });
    await expect(service.authorizeSessionCredentials({
      sessionId: login.session.id,
      password: "wrong",
      pin: undefined,
      totp: undefined
    })).rejects.toThrow("Invalid username or credentials");
  });

  it("requires PIN for credential rotation only after a PIN is configured", async () => {
    const service = new IdentityAccessService();
    const login = await service.authenticate({ username: "admin", password: "admin" });

    await expect(service.setPasswordAuthorized({
      userId: "admin",
      password: "changed-password",
      sessionId: login.session.id,
      authorizationPassword: "admin",
      authorizationPin: undefined,
      authorizationTotp: undefined
    })).resolves.toMatchObject({ userId: "admin" });

    const changedLogin = await service.authenticate({ username: "admin", password: "changed-password" });
    await service.setPinAuthorized({
      userId: "admin",
      pin: "1234",
      sessionId: changedLogin.session.id,
      authorizationPassword: "changed-password",
      authorizationPin: undefined,
      authorizationTotp: undefined
    });

    await expect(service.setPasswordAuthorized({
      userId: "admin",
      password: "blocked-password",
      sessionId: changedLogin.session.id,
      authorizationPassword: "changed-password",
      authorizationPin: "0000",
      authorizationTotp: undefined
    })).rejects.toThrow("Invalid username or credentials");

    await expect(service.authenticate({ username: "admin", password: "changed-password" })).resolves.toMatchObject({
      user: { id: "admin" }
    });
  });

  it("requires the global user PIN for Automation Studio project organization changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-pin-"));
    try {
      const paths = {
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
      };
      const runtime = createGlobalProgramRuntime(paths);
      const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
      await runtime.identityAccess.setPinAuthorized({
        userId: "admin",
        pin: "1234",
        sessionId: login.session.id,
        authorizationPassword: "admin",
        authorizationPin: undefined,
        authorizationTotp: undefined
      });
      const reloadedRuntime = createGlobalProgramRuntime(paths);

      await expect(reloadedRuntime.api.call({
        programId: "automation-studio",
        endpoint: "create-project-category",
        scope: {},
        actor: actorFor(login),
        payload: { name: "Blocked", authSessionId: login.session.id, authorizationPin: "0000" }
      })).resolves.toMatchObject({ ok: false, error: "Invalid PIN" });

      const first = await reloadedRuntime.api.call<{ name: string; authSessionId: string; authorizationPin: string }, { category: { id: string; name: string; order: number } }>({
        programId: "automation-studio",
        endpoint: "create-project-category",
        scope: {},
        actor: actorFor(login),
        payload: { name: "First", authSessionId: login.session.id, authorizationPin: "1234" }
      });
      const second = await reloadedRuntime.api.call<{ name: string; authSessionId: string; authorizationPin: string }, { category: { id: string; name: string; order: number } }>({
        programId: "automation-studio",
        endpoint: "create-project-category",
        scope: {},
        actor: actorFor(login),
        payload: { name: "Second", authSessionId: login.session.id, authorizationPin: "1234" }
      });

      const firstId = first.payload?.category.id ?? "";
      const secondId = second.payload?.category.id ?? "";
      await expect(reloadedRuntime.api.call({
        programId: "automation-studio",
        endpoint: "reorder-project-categories",
        scope: {},
        actor: actorFor(login),
        payload: { categoryIds: [secondId, firstId], authSessionId: login.session.id, authorizationPin: "1234" }
      })).resolves.toMatchObject({ ok: true, payload: { categories: [{ id: secondId }, { id: firstId }] } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("upgrades legacy PIN metadata on login before program PIN authorization", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-pin-legacy-"));
    try {
      const paths = {
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
      };
      const runtime = createGlobalProgramRuntime(paths);
      const firstLogin = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
      await runtime.identityAccess.setPinAuthorized({
        userId: "admin",
        pin: "1234",
        sessionId: firstLogin.session.id,
        authorizationPassword: "admin",
        authorizationPin: undefined,
        authorizationTotp: undefined
      });

      const repository = new SQLiteRepository({ rootDir: paths.databases, kind: "identity.users" });
      const credentialRecord = await repository.get("credential:admin", {});
      const metadata = credentialRecord?.data.metadata as Record<string, unknown> | undefined;
      expect(metadata?.pinVerifierHash).toBeTruthy();
      delete metadata!.pinVerifierHash;
      await repository.put({ ...credentialRecord!, data: { ...credentialRecord!.data, metadata: metadata as any } });

      const reloadedRuntime = createGlobalProgramRuntime(paths);
      const login = await reloadedRuntime.identityAccess.authenticate({ username: "admin", password: "admin" });
      await expect(reloadedRuntime.api.call({
        programId: "automation-studio",
        endpoint: "create-project-category",
        scope: {},
        actor: actorFor(login),
        payload: { name: "Recovered", authSessionId: login.session.id, authorizationPin: "1234" }
      })).resolves.toMatchObject({ ok: true, payload: { category: { name: "Recovered" } } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates only populated documents in legacy folder-backed project workspaces", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-folders-"));
    try {
      const dataDir = path.join(root, ".fluxiq", "data");
      const service = new AutomationStudioService({ dataDir, seedFixture: false });
      const project = await service.createProject({ name: "Folder Project", description: "Uses folders" });
      await service.saveProjectHierarchy(project.id, {
        customHierarchyNodes: [{ id: "folder-1", label: "Ops", kind: "folder", category: "task", parentId: null }],
        deletedHierarchyIds: ["old-node"],
        workspacePrefs: { sidebarWidth: 300 }
      });

      const projectRoot = path.join(dataDir, "programs", "automation-studio", "projects", project.id);
      const index = JSON.parse(await readFile(path.join(dataDir, "programs", "automation-studio", "projects", "index.json"), "utf8"));
      const manifest = JSON.parse(await readFile(path.join(projectRoot, "manifest.json"), "utf8"));
      const nodes = JSON.parse(await readFile(path.join(projectRoot, "hierarchy", "nodes.json"), "utf8"));
      const deleted = JSON.parse(await readFile(path.join(projectRoot, "hierarchy", "deleted.json"), "utf8"));
      const prefs = JSON.parse(await readFile(path.join(projectRoot, "workspace", "preferences.json"), "utf8"));

      expect(index.data.projects).toContainEqual(expect.objectContaining({ id: project.id, name: "Folder Project" }));
      expect(manifest.data).toMatchObject({ id: project.id, name: "Folder Project" });
      expect(nodes.data.customHierarchyNodes).toHaveLength(1);
      expect(deleted.data.deletedHierarchyIds).toEqual(["old-node"]);
      expect(prefs.data.workspacePrefs).toMatchObject({ sidebarWidth: 300 });
      await expect(stat(path.join(projectRoot, "recordings"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(path.join(projectRoot, "custom-nodes"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(path.join(projectRoot, "artifacts"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(path.join(dataDir, "programs", "automation-studio", "nodes"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrates legacy Automation Studio projects.json into project folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-legacy-projects-"));
    try {
      const dataDir = path.join(root, ".fluxiq", "data");
      const legacyPath = path.join(dataDir, "programs", "automation-studio", "projects.json");
      await mkdir(path.dirname(legacyPath), { recursive: true });
      await writeFile(legacyPath, `${JSON.stringify({
        version: 1,
        data: {
          categories: [{ id: "cat-1", name: "Legacy", order: 0, createdAt: 1, updatedAt: 1 }],
          projects: [{
            id: "legacy-project",
            name: "Legacy Project",
            description: "Old storage",
            categoryId: "cat-1",
            createdAt: 1,
            updatedAt: 2,
            customHierarchyNodes: [{ id: "routine-1", label: "Routine", kind: "routine", category: "routine", parentId: null }],
            deletedHierarchyIds: ["deleted-1"],
            workspacePrefs: { windowsPerRow: 3 }
          }]
        }
      }, null, 2)}\n`, "utf8");

      const service = new AutomationStudioService({ dataDir, seedFixture: false });
      await expect(service.listProjects()).resolves.toMatchObject({
        categories: [{ id: "cat-1", name: "Legacy" }],
        projects: [{ id: "legacy-project", name: "Legacy Project" }]
      });
      await expect(service.getProjectHierarchy("legacy-project")).resolves.toMatchObject({
        customHierarchyNodes: [{ id: "routine-1" }],
        deletedHierarchyIds: ["deleted-1"],
        workspacePrefs: { windowsPerRow: 3 }
      });
      await expect(readFile(path.join(dataDir, "programs", "automation-studio", "projects", "legacy-project", "manifest.json"), "utf8")).resolves.toContain("Legacy Project");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("sees persisted sessions created by another identity runtime", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-identity-"));
    try {
      const repository = new SQLiteRepository({ rootDir: root, kind: "identity.users" });
      const pageRuntime = new IdentityAccessService({ repository });
      expect(await pageRuntime.validateSession("missing")).toBeNull();

      const loginRuntime = new IdentityAccessService({ repository: new SQLiteRepository({ rootDir: root, kind: "identity.users" }) });
      const login = await loginRuntime.authenticate({ username: "admin", password: "admin" });
      const credentialRecord = await repository.get("credential:admin", {});

      expect(await pageRuntime.validateSession(login.session.id)).toMatchObject({
        user: { id: "admin" }
      });
      expect(credentialRecord?.data.encrypted).toBe(true);
      expect(credentialRecord?.data.credential).toBeUndefined();
      expect(JSON.stringify(credentialRecord?.data)).not.toContain("passwordHash");
      expect(JSON.stringify(credentialRecord?.data.sealed)).not.toContain("passwordHash");
      expect(JSON.stringify(credentialRecord?.data.sealed)).not.toContain("admin");
      expect(credentialRecord?.data.sealed).toMatchObject({
        algorithm: "aes-256-gcm",
        kdf: "scrypt"
      });
      expect(credentialRecord?.data.metadata).toMatchObject({
        userId: "admin",
        passwordConfigured: true,
        pinConfigured: false
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrates a legacy plaintext credential record after that user logs in", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-identity-legacy-"));
    try {
      const repository = new SQLiteRepository({ rootDir: root, kind: "identity.users" });
      const nowMs = Date.now();
      for (const user of [
        { id: "legacy", username: "legacy", password: "legacy-password" },
        { id: "waiting", username: "waiting", password: "waiting-password" }
      ]) {
        await repository.put(createRecord({
          id: `user:${user.id}`,
          kind: "identity.users",
          data: {
            stateKind: "user",
            recordType: "user",
            user: {
              id: user.id,
              username: user.username,
              displayName: user.username,
              roleId: "admin",
              enabled: true,
              totpEnabled: false,
              createdAtMs: nowMs,
              updatedAtMs: nowMs
            }
          },
          nowMs
        }));
        await repository.put(createRecord({
          id: `credential:${user.id}`,
          kind: "identity.users",
          data: {
            stateKind: "credential",
            recordType: "credential",
            credential: {
              userId: user.id,
              passwordHash: testHashSecret(user.password),
              updatedAtMs: nowMs
            }
          },
          nowMs
        }));
      }

      const service = new IdentityAccessService({ repository: new SQLiteRepository({ rootDir: root, kind: "identity.users" }) });
      await expect(service.authenticate({ username: "legacy", password: "legacy-password" })).resolves.toMatchObject({
        user: { id: "legacy" }
      });

      const migrated = await repository.get("credential:legacy", {});
      const waiting = await repository.get("credential:waiting", {});
      expect(migrated?.data.encrypted).toBe(true);
      expect(migrated?.data.credential).toBeUndefined();
      expect(JSON.stringify(migrated?.data.sealed)).not.toContain("passwordHash");
      expect(waiting?.data.credential).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires an authenticator code after password passes for 2FA users", async () => {
    const service = new IdentityAccessService();
    const setup = await service.beginTotp("admin");
    const code = testTotpCode(setup.secret);
    expect(setup.qrSvg).toContain("<svg");
    expect(setup.otpauthUrl).toContain("otpauth://totp/");
    await service.confirmTotp("admin", code);

    await expect(service.authenticate({ username: "admin", password: "admin" })).rejects.toBeInstanceOf(TotpRequiredError);
    await expect(service.authenticate({ username: "admin", password: "admin", totp: code })).resolves.toMatchObject({
      user: { id: "admin" }
    });
  });


  it("creates secret keys without requiring TOTP but requires TOTP to reveal them", async () => {
    const runtime = createGlobalProgramRuntime();
    const setup = await runtime.identityAccess.beginTotp("admin");
    const code = testTotpCode(setup.secret);
    await runtime.identityAccess.confirmTotp("admin", code);
    const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin", totp: code });

    const created = await runtime.api.call({
      programId: "secret-keys",
      endpoint: "create-key",
      scope: {},
      actor: actorFor(login),
      payload: { name: "DeepSeek", value: "sk-secret", provider: "DeepSeek", authSessionId: login.session.id, authorizationPassword: "admin" }
    }) as { ok: boolean; payload?: { id: string }; error?: string };

    expect(created.ok, created.error).toBe(true);
    await expect(runtime.api.call({
      programId: "secret-keys",
      endpoint: "reveal-key",
      scope: {},
      actor: actorFor(login),
      payload: { id: created.payload?.id, authSessionId: login.session.id, authorizationPassword: "admin" }
    })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    await expect(runtime.api.call({
      programId: "secret-keys",
      endpoint: "reveal-key",
      scope: {},
      actor: actorFor(login),
      payload: { id: created.payload?.id, authSessionId: login.session.id, authorizationPassword: "admin", authorizationTotp: code }
    })).resolves.toMatchObject({ ok: true, payload: { value: "sk-secret" } });
  });
  it("starts and stops production runs", async () => {
    const service = new ProductionRunnerService();
    const run = await service.startRun({ name: "Demo", domainId: null, nowMs: 1000 });
    const stopped = await service.stopRun(run.id, 2000);

    expect(stopped.status).toBe("stopped");
    expect((await service.snapshot()).runs).toHaveLength(1);
  });
});

function actorFor(login: Awaited<ReturnType<IdentityAccessService["authenticate"]>>): ProgramApiActor {
  return {
    sessionId: login.session.id,
    userId: login.user.id,
    roleId: login.role.id,
    permissions: login.role.permissions
  };
}

function testTotpCode(secret: string, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / 30_000);
  const key = decodeBase32(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0xf;
  const binary = (((digest.at(offset) ?? 0) & 0x7f) << 24) | (((digest.at(offset + 1) ?? 0) & 0xff) << 16) | (((digest.at(offset + 2) ?? 0) & 0xff) << 8) | ((digest.at(offset + 3) ?? 0) & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function testHashSecret(value: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(value, salt, 32).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const raw of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(raw);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}
