import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BackgroundTasksService } from "./background-tasks";
import { ComputeControlService } from "./compute-control";
import { DatabaseManagerService, FileRepository, createRecord } from "./database-manager";
import { DeploymentSyncService } from "./deployment-sync";
import { DocsService } from "./docs";
import { IdentityAccessService } from "./identity-access";
import { createGlobalProgramRuntime } from "./index";
import { ProductionRunnerService } from "./production-runner";

describe("global program services", () => {
  it("registers non-automation global program API endpoints", () => {
    const runtime = createGlobalProgramRuntime();
    const endpoints = runtime.api.endpoints().map((endpoint) => `${endpoint.programId}/${endpoint.endpoint}`);

    expect(endpoints).toContain("identity-access/snapshot");
    expect(endpoints).toContain("database-manager/snapshot");
    expect(endpoints).toContain("background-tasks/snapshot");
    expect(endpoints).toContain("compute-control/snapshot");
    expect(endpoints).toContain("deployment-sync/snapshot");
    expect(endpoints).toContain("docs/snapshot");
    expect(endpoints).toContain("production-runner/snapshot");
    expect(endpoints.some((endpoint) => endpoint.startsWith("automation-studio/"))).toBe(false);
  });

  it("runs background tasks through the service", async () => {
    const service = new BackgroundTasksService();
    service.register({ id: "refresh", name: "Refresh", queue: "default", enabled: true }, () => ({ ok: true }));

    const run = await service.run("refresh", undefined, 1000);

    expect(run.status).toBe("succeeded");
    expect(service.snapshot().runs).toHaveLength(1);
  });

  it("tracks compute nodes, commands, and leases", () => {
    const service = new ComputeControlService();
    service.upsertNode({ id: "local", label: "Local", status: "online", domainIds: [], capabilities: ["flows"] });

    service.enqueueCommand({ targetComputeId: "local", kind: "pause", nowMs: 1000 });
    service.acquireLease({ computeId: "local", holder: "test", purpose: "run", ttlMs: 1000, nowMs: 1000 });

    const snapshot = service.snapshot(1000);
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.commands).toHaveLength(1);
    expect(snapshot.leases).toHaveLength(1);
  });

  it("summarizes database repositories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-programs-"));
    try {
      const repo = new FileRepository({ rootDir: root, kind: "widgets" });
      const service = new DatabaseManagerService().registerRepository("widgets", repo);

      await repo.put(createRecord({ id: "alpha", kind: "widgets", data: { name: "Alpha" }, nowMs: 1000 }));

      expect((await service.snapshot()).stores[0]?.recordCount).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("syncs deployment targets through an adapter", async () => {
    const service = new DeploymentSyncService({ sync: () => "synced" });
    service.upsertTarget({ id: "prod", name: "Production", environment: "prod", status: "idle" });

    const run = await service.sync("prod", 1000);

    expect(run.status).toBe("synced");
    expect(service.snapshot().targets[0]?.status).toBe("synced");
  });

  it("creates docs snapshots from registered sources", async () => {
    const service = new DocsService();
    service.registerSource({ id: "missing", title: "Missing", rootDir: "does-not-exist", scope: "framework" });

    const snapshot = await service.snapshot(1000);

    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.pages).toHaveLength(0);
  });

  it("manages identity users and sessions", () => {
    const service = new IdentityAccessService();
    const user = service.upsertUser({
      id: "admin",
      username: "admin",
      displayName: "Admin",
      roleId: "admin",
      nowMs: 1000
    });

    service.createSession(user.id, 1000, 1000);

    expect(service.snapshot(1000).sessions).toHaveLength(1);
  });

  it("starts and stops production runs", async () => {
    const service = new ProductionRunnerService();
    const run = await service.startRun({ name: "Demo", domainId: null, nowMs: 1000 });
    const stopped = await service.stopRun(run.id, 2000);

    expect(stopped.status).toBe("stopped");
    expect(service.snapshot().runs).toHaveLength(1);
  });
});
