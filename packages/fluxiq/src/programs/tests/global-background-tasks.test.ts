// The background task service: scheduling, controls, and persisted countdown state.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BackgroundTasksService } from "../background-tasks/index.ts";
import { SQLiteRepository } from "../database-manager/index.ts";
import { createGlobalProgramRuntime } from "../index.ts";

describe("global program services", () => {
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

});
