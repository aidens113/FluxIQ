import { describe, expect, it, vi } from "vitest";
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

  it("drains admitted runs once and persists their terminal state before close resolves", async () => {
    const { repository, puts } = memoryRepository();
    const service = new BackgroundTasksService({ repository, pollIntervalMs: 60000, stateWriteIntervalMs: 3_600_000 });
    let finishRun!: () => void;
    const gate = new Promise<void>((resolve) => { finishRun = resolve; });
    service.register({ id: "a", name: "A", queue: "q", enabled: true }, () => gate);
    const running = service.run("a");
    await vi.waitFor(() => expect(service.activity().running).toBe(1));
    const closing = service.close();
    expect(service.close()).toBe(closing);
    let closed = false;
    void closing.then(() => { closed = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    await expect(service.run("a")).rejects.toThrow(/closed/);
    finishRun();
    const finished = await running;
    await closing;
    const stored = puts.filter((item) => item.id === `run:${finished.id}`).at(-1);
    expect(stored?.data.run).toMatchObject({ status: "succeeded" });
    expect(service.activity()).toEqual({ running: 0, scheduled: 0 });
  });

  it("waits for one shared load before running or closing over its storage", async () => {
    const { repository } = memoryRepository();
    let finishLoad!: (records: RecordEnvelope[]) => void;
    const gate = new Promise<RecordEnvelope[]>((resolve) => { finishLoad = resolve; });
    const read = vi.spyOn(repository, "list").mockReturnValue(gate);
    const handler = vi.fn(async () => undefined);
    const service = new BackgroundTasksService({ repository, pollIntervalMs: 60000 });
    service.register({ id: "a", name: "A", queue: "q", enabled: true }, handler);
    const snapshot = service.snapshot();
    const running = service.run("a");
    await new Promise((resolve) => setImmediate(resolve));
    expect(read).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
    const closing = service.close();
    let closed = false;
    void closing.then(() => { closed = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    finishLoad([]);
    await Promise.all([snapshot, running, closing]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await service.snapshot()).scheduler.running).toBe(false);
  });

  it("does not pin a workspace with a stopped scheduler or run another due task during close", async () => {
    const service = new BackgroundTasksService({ pollIntervalMs: 60000 });
    let finishRun!: () => void;
    const gate = new Promise<void>((resolve) => { finishRun = resolve; });
    const second = vi.fn(async () => undefined);
    service.register({ id: "a", name: "A", queue: "q", enabled: true, intervalMs: 1, nextRunAtMs: 1 }, () => gate);
    service.register({ id: "b", name: "B", queue: "q", enabled: true, intervalMs: 1, nextRunAtMs: 1 }, second);
    await service.stop();
    expect(service.activity().scheduled).toBe(0);
    await service.start();
    const due = service.runDueTasks();
    await vi.waitFor(() => expect(service.activity().running).toBe(1));
    const closing = service.close();
    finishRun();
    await Promise.all([due, closing]);
    expect(second).not.toHaveBeenCalled();
    expect(await service.runDueTasks()).toEqual([]);
  });

  it("serializes concurrent flushes and the closing flush over an in-flight write", async () => {
    const { repository } = memoryRepository();
    const service = new BackgroundTasksService({ repository, pollIntervalMs: 60000 });
    service.register({ id: "a", name: "A", queue: "q", enabled: true });
    await service.snapshot();
    let finishWrite!: () => void;
    const gate = new Promise<void>((resolve) => { finishWrite = resolve; });
    let active = 0;
    let maximum = 0;
    let writes = 0;
    const put = repository.put.bind(repository);
    vi.spyOn(repository, "put").mockImplementation(async (item) => {
      active += 1;
      writes += 1;
      maximum = Math.max(maximum, active);
      if (writes === 1) await gate;
      else await new Promise((resolve) => setImmediate(resolve));
      const result = await put(item);
      active -= 1;
      return result;
    });
    const first = service.flushPendingWrites();
    const second = service.flushPendingWrites();
    const closing = service.close();
    await new Promise((resolve) => setImmediate(resolve));
    expect(writes).toBe(1);
    finishWrite();
    await Promise.all([first, second, closing]);
    expect(maximum).toBe(1);
    expect(active).toBe(0);
  });
});
