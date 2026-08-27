import { describe, expect, it } from "vitest";
import { BackgroundTasksService } from "./runtime/service";

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
