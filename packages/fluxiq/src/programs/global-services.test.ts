import { mkdtemp, rm } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BackgroundTasksService } from "./background-tasks";
import { ComputeControlService } from "./compute-control";
import { DatabaseManagerService, SQLiteRepository, createRecord } from "./database-manager";
import { DeploymentSyncService } from "./deployment-sync";
import { DocsService } from "./docs";
import { IdentityAccessService, TotpRequiredError } from "./identity-access";
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

  it("manages identity users and sessions", async () => {
    const service = new IdentityAccessService();
    const user = (await service.snapshot(1000)).users.find((item) => item.id === "admin");

    expect(user?.username).toBe("admin");
    await service.createSession(user?.id ?? "", 1000, 1000);

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
      pin: "1234",
      totp: undefined
    })).resolves.toMatchObject({ username: "admin" });
    await expect(service.authorizeSessionCredentials({
      sessionId: login.session.id,
      password: "admin",
      pin: "0000",
      totp: undefined
    })).rejects.toThrow("Invalid username or credentials");
  });

  it("requires password and PIN before rotating credentials", async () => {
    const service = new IdentityAccessService();
    const login = await service.authenticate({ username: "admin", password: "admin" });

    await expect(service.setPasswordAuthorized({
      userId: "admin",
      password: "changed-password",
      sessionId: login.session.id,
      authorizationPassword: "admin",
      authorizationPin: "0000",
      authorizationTotp: undefined
    })).rejects.toThrow("Invalid username or credentials");

    await expect(service.setPasswordAuthorized({
      userId: "admin",
      password: "changed-password",
      sessionId: login.session.id,
      authorizationPassword: "admin",
      authorizationPin: "1234",
      authorizationTotp: undefined
    })).resolves.toMatchObject({ userId: "admin" });

    await expect(service.authenticate({ username: "admin", password: "changed-password" })).resolves.toMatchObject({
      user: { id: "admin" }
    });
  });

  it("sees persisted sessions created by another identity runtime", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-identity-"));
    try {
      const pageRuntime = new IdentityAccessService({ dataDir: root });
      expect(await pageRuntime.validateSession("missing")).toBeNull();

      const loginRuntime = new IdentityAccessService({ dataDir: root });
      const login = await loginRuntime.authenticate({ username: "admin", password: "admin" });

      expect(await pageRuntime.validateSession(login.session.id)).toMatchObject({
        user: { id: "admin" }
      });
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

  it("starts and stops production runs", async () => {
    const service = new ProductionRunnerService();
    const run = await service.startRun({ name: "Demo", domainId: null, nowMs: 1000 });
    const stopped = await service.stopRun(run.id, 2000);

    expect(stopped.status).toBe("stopped");
    expect((await service.snapshot()).runs).toHaveLength(1);
  });
});

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
