import { describe, expect, it } from "vitest";
import { AutomationStudioRunDetailLock } from "../run-detail-lock.ts";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("AutomationStudioRunDetailLock", () => {
  it("runs saves of one run one at a time, in arrival order, and saves of other runs alongside", async () => {
    const lock = new AutomationStudioRunDetailLock();
    const events: string[] = [];
    const firstGate = deferred();
    const first = lock.withRun("project.a", "run.a", async () => { events.push("first:start"); await firstGate.promise; events.push("first:end"); return 1; });
    const second = lock.withRun("project.a", "run.a", async () => { events.push("second:start"); return 2; });
    const other = lock.withRun("project.a", "run.b", async () => { events.push("other"); return 3; });

    await expect(other).resolves.toBe(3);
    await Promise.resolve();
    expect(events).toEqual(["first:start", "other"]);
    firstGate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(["first:start", "other", "first:end", "second:start"]);
  });

  it("releases the run when a save fails, so the next save still runs", async () => {
    const lock = new AutomationStudioRunDetailLock();
    await expect(lock.withRun("project.a", "run.a", async () => { throw new Error("write failed"); })).rejects.toThrow("write failed");
    await expect(lock.withRun("project.a", "run.a", async () => "saved")).resolves.toBe("saved");
  });
});
