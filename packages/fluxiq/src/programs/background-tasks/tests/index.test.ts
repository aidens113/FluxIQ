import { describe, expect, it } from "vitest";
import type { RecordEnvelope, Repository } from "../../database-manager/index.ts";
import { BackgroundTasksService } from "../runtime/service";

describe("BackgroundTasksService run pages", () => {
  it("keeps snapshots bounded and pages filtered task history", async () => {
    const service = new BackgroundTasksService({ pollIntervalMs: 60000 });
    service.register({ id: "task", name: "Task", queue: "test", enabled: true }, async (payload) => payload);
    for (let index = 0; index < 75; index += 1) await service.run("task", { index });
    expect((await service.snapshot()).runs).toHaveLength(20);
    const page = await service.detail("task", 25, 50, "succeeded");
    expect(page).toMatchObject({ total: 75, limit: 25, offset: 50 });
    expect(page.runs).toHaveLength(25);
    expect(page.runs.every((run) => run.status === "succeeded")).toBe(true);
  });
});

function memoryRepository(): { repository: Repository; puts: RecordEnvelope[] } {
  const puts: RecordEnvelope[] = [];
  const repository = {
    put: async (item: RecordEnvelope) => {
      puts.push(item);
      return item;
    },
    list: async () => []
  } as unknown as Repository;
  return { repository, puts };
}

describe("BackgroundTasksService close and activity", () => {
  it("reports no activity before the tasks load, without loading them", () => {
    const service = new BackgroundTasksService({ pollIntervalMs: 60000 });
    service.register({ id: "t", name: "T", queue: "q", enabled: true, intervalMs: 1000 });
    expect(service.activity()).toEqual({ running: 0, scheduled: 0 });
  });

  it("counts enabled interval tasks outside maintenance, and runs in progress", async () => {
    const service = new BackgroundTasksService({ pollIntervalMs: 60000 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    service.register({ id: "a", name: "A", queue: "q", enabled: true, intervalMs: 1000 }, () => gate);
    service.register({ id: "m", name: "M", queue: "maintenance", enabled: true, intervalMs: 1000 });
    service.register({ id: "off", name: "Off", queue: "q", enabled: false, intervalMs: 1000 });
    service.register({ id: "once", name: "Once", queue: "q", enabled: true });
    await service.snapshot();
    expect(service.activity()).toEqual({ running: 0, scheduled: 1 });
    const pending = service.run("a");
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.activity().running).toBe(1);
    release();
    await pending;
    expect(service.activity().running).toBe(0);
    await service.close();
  });

  it("close stops the scheduler, refuses runs, and is idempotent", async () => {
    const service = new BackgroundTasksService({ pollIntervalMs: 60000 });
    service.register({ id: "a", name: "A", queue: "q", enabled: true, intervalMs: 1000 });
    expect((await service.snapshot()).scheduler.running).toBe(true);
    await service.close();
    await service.close();
    expect(service.activity()).toEqual({ running: 0, scheduled: 0 });
    await expect(service.run("a")).rejects.toThrow(/closed/);
    expect((await service.snapshot()).scheduler.running).toBe(false);
  });

  it("close flushes a pending debounced write", async () => {
    const { repository, puts } = memoryRepository();
    const service = new BackgroundTasksService({ repository, pollIntervalMs: 60000, stateWriteIntervalMs: 3_600_000 });
    service.register({ id: "a", name: "A", queue: "q", enabled: true });
    await service.run("a");
    const before = puts.length;
    await service.close();
    expect(puts.length).toBeGreaterThan(before);
    expect(puts.some((item) => item.id === "task:a")).toBe(true);
  });
});
