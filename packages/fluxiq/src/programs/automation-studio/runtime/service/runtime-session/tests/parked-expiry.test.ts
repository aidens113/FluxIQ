import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { automationStudioParkedRun, automationStudioPersonNeededAsk, automationStudioPersonNeededAskDraft } from "../../../parking/index.ts";
import { AutomationStudioService } from "../../../index.ts";
import { AutomationStudioParkedRunExpiry } from "../index.ts";

let seen: ClientGatewayActivity[];
let unsubscribe: () => void;
const clocks: AutomationStudioParkedRunExpiry[] = [];
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000);
  seen = []; unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(async () => { await Promise.all(clocks.splice(0).map((clock) => clock.close())); unsubscribe(); vi.useRealTimers(); });

function session(deadline: number | undefined = 1_100): AutomationStudioRuntimeSession {
  const ask = automationStudioPersonNeededAsk({ ...automationStudioPersonNeededAskDraft({}), askId: "person.deadline" }, { stage: "execution" });
  const parked = { ...automationStudioParkedRun({ ask, nodeId: "click", definitionId: "test.click", attemptId: "click.1", parkedAtMs: 1_000, carried: { variables: {}, loops: {}, stepsTaken: 1, maxSteps: 10 } }), expiresAtMs: deadline };
  return {
    schemaVersion: "0.1", runId: "run.one", projectId: "project.one", targetKind: "flow", targetId: "flow.one", flowId: "flow.one", status: "waiting", queuedAt: 1_000,
    flow: { flowId: "flow.one" } as AutomationStudioRuntimeSession["flow"],
    trace: { status: "waiting", startedAt: 1_000, attempts: [], values: {}, effects: [], parked }
  };
}
function fixture(initial = session()) {
  let stored: AutomationStudioRuntimeSession | null = initial;
  const write = vi.fn(async (_projectId: string, value: AutomationStudioRuntimeSession) => { stored = value; });
  const clock = new AutomationStudioParkedRunExpiry({ read: async () => stored, list: async () => stored ? [stored] : [], write }); clocks.push(clock);
  return { clock, write, read: () => stored, replace: (value: AutomationStudioRuntimeSession | null) => { stored = value; } };
}
const resolutions = () => seen.filter((event) => event.detail?.resolution).map((event) => event.detail?.resolution);

describe("parked runtime-session expiry", () => {
  it("settles a tracked deadline at its time without requiring a reader", async () => {
    const f = fixture(); f.clock.track("project.one", f.read()!);
    await vi.advanceTimersByTimeAsync(99); expect(resolutions()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.read()).toMatchObject({ status: "failed", finishedAt: 1_100, trace: { status: "failed", parked: { ask: { status: "expired" } } } });
    expect(resolutions()).toEqual(["timed_out"]);
    expect(seen.at(-1)).toMatchObject({ activityId: "run:run.one", detail: { ref: "person.deadline" } });
    await f.clock.expire("project.one", "run.one"); expect(resolutions()).toEqual(["timed_out"]);
  });

  it("expires persisted overdue waits when read after restart", async () => {
    const f = fixture(session(900));
    expect(await f.clock.expire("project.one", "run.one")).toMatchObject({ status: "failed" });
    expect(resolutions()).toEqual(["timed_out"]);
  });

  it("keeps indefinite waits and re-arms unexpired records", async () => {
    const indefinite = fixture(session(undefined));
    // Explicitly remove the deadline: a default argument would supply one.
    delete indefinite.read()!.trace!.parked!.expiresAtMs;
    await indefinite.clock.expire("project.one", "run.one");
    await vi.advanceTimersByTimeAsync(100);
    expect(indefinite.read()?.status).toBe("waiting"); expect(resolutions()).toEqual([]);
  });

  it("persists before resolving and retries a failed deadline write", async () => {
    const f = fixture(); const error = new Error("write refused");
    f.write.mockRejectedValueOnce(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    f.clock.track("project.one", f.read()!);
    await vi.advanceTimersByTimeAsync(100);
    expect(f.read()?.status).toBe("waiting"); expect(resolutions()).toEqual([]); expect(log).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(resolutions()).toEqual(["timed_out"]); log.mockRestore();
  });

  it.each(["cancel", "expiry"] as const)("serializes concurrent cancellation and expiry when %s is first", async (first) => {
    const f = fixture(session(900)); const abort = vi.fn();
    const cancel = () => f.clock.cancel("project.one", "run.one", "Stopped", abort);
    const expire = () => f.clock.expire("project.one", "run.one");
    await Promise.all(first === "cancel" ? [cancel(), expire()] : [expire(), cancel()]);
    expect(resolutions()).toEqual([first === "cancel" ? "cancelled" : "timed_out"]);
    expect(f.write).toHaveBeenCalledOnce();
  });

  it("does not settle a run that moved on before its deadline, or a closed service", async () => {
    const f = fixture(); f.clock.track("project.one", f.read()!);
    f.replace({ ...f.read()!, status: "succeeded" }); await vi.advanceTimersByTimeAsync(100);
    expect(resolutions()).toEqual([]); expect(f.write).not.toHaveBeenCalled();
    f.replace(session(1_200)); f.clock.track("project.one", f.read()!); await f.clock.close(); await vi.advanceTimersByTimeAsync(100);
    expect(resolutions()).toEqual([]);
  });

  it("settles a parked wait before removing its project and never expires the removed record", async () => {
    const f = fixture(); f.clock.track("project.one", f.read()!);
    await f.clock.withProjectRemoval("project.one", async () => {
      expect(resolutions()).toEqual(["cancelled"]);
      expect(f.read()?.status).toBe("cancelled"); f.replace(null);
    });
    await vi.advanceTimersByTimeAsync(100); expect(resolutions()).toEqual(["cancelled"]);
  });

  it("blocks deadline writes while project removal runs and preserves removal failure", async () => {
    const f = fixture(); f.clock.track("project.one", f.read()!);
    const error = new Error("remove failed");
    await expect(f.clock.withProjectRemoval("project.one", async () => {
      await vi.advanceTimersByTimeAsync(100);
      expect(resolutions()).toEqual(["cancelled"]); expect(f.write).toHaveBeenCalledOnce();
      throw error;
    })).rejects.toBe(error);
    expect(f.read()?.status).toBe("cancelled");
    expect(resolutions()).toEqual(["cancelled"]);
    await f.clock.expire("project.one", "run.one"); expect(resolutions()).toEqual(["cancelled"]);
  });
  it("rejects overlapping project deletion without releasing the first deletion guard", async () => {
    const f = fixture();
    let finish!: () => void;
    const removed = f.clock.withProjectRemoval("project.one", async () => await new Promise<void>((resolve) => { finish = resolve; }));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await expect(f.clock.withProjectRemoval("project.one", async () => undefined)).rejects.toThrow("already being removed");
    await expect(f.clock.expire("project.one", "run.one")).rejects.toThrow("being removed");
    finish(); await removed;
  });

  it("waits for an in-flight deadline write before closing the service", async () => {
    const f = fixture(session(900));
    let finish!: () => void;
    f.write.mockImplementationOnce(async (_project, value) => {
      await new Promise<void>((resolve) => { finish = resolve; }); f.replace(value);
    });
    const expiring = f.clock.expire("project.one", "run.one");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    let closed = false; const closing = f.clock.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false); expect(resolutions()).toEqual([]);
    finish(); await expiring; await closing;
    expect(closed).toBe(true); expect(resolutions()).toEqual(["timed_out"]);
  });

  it("restores deadlines only for waiting rows in the public summary page", async () => {
    const f = fixture(session(900));
    const expire = vi.spyOn(f.clock, "expire");
    const list = vi.fn(async () => ({ runs: [{ runId: "run.one", status: f.read()!.status }, { runId: "queued.other", status: "queued" }], total: 100, limit: 2, offset: 5 }));
    const receiver = { summaries: { listRuntimeSessionSummaries: list }, parkedRunExpiry: f.clock } as unknown as AutomationStudioService;
    const page = await AutomationStudioService.prototype.listRuntimeSessionSummaries.call(receiver, "project.one", { limit: 2, offset: 5 });
    expect(expire).toHaveBeenCalledOnce();
    expect(expire).toHaveBeenCalledWith("project.one", "run.one");
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith("project.one", { limit: 2, offset: 5 });
    expect(page.runs[0]?.status).toBe("failed"); expect(resolutions()).toEqual(["timed_out"]);
  });

  it("the public delete method settles parked asks before removing project records", async () => {
    const f = fixture();
    const removeIndex = vi.fn(async () => {
      expect(resolutions()).toEqual(["cancelled"]); expect(f.read()?.status).toBe("cancelled");
    });
    const receiver = {
      parkedRunExpiry: f.clock, projects: { requireProject: async () => undefined, writeProjectIndex: removeIndex },
      projectPaths: {}, uiCache: { purgeProject: async () => undefined }
    } as unknown as AutomationStudioService;
    expect(await AutomationStudioService.prototype.deleteProject.call(receiver, "project.one")).toEqual({ deletedProjectId: "project.one" });
    expect(removeIndex).toHaveBeenCalledOnce();
  });

  it("does not delete or resolve when cancelling a parked session cannot be persisted", async () => {
    const f = fixture(); f.clock.track("project.one", f.read()!);
    const error = new Error("cancel write refused"); f.write.mockRejectedValueOnce(error);
    const remove = vi.fn(async () => undefined);
    await expect(f.clock.withProjectRemoval("project.one", remove)).rejects.toBe(error);
    expect(remove).not.toHaveBeenCalled(); expect(resolutions()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000); expect(resolutions()).toEqual(["cancelled"]);
  });

  it("retries every persistence stage after expiry stored its session and then failed", async () => {
    const f = fixture(); const error = new Error("detail write refused");
    f.write.mockImplementationOnce(async (_project, value) => { f.replace(value); throw error; });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    f.clock.track("project.one", f.read()!); await vi.advanceTimersByTimeAsync(100);
    expect(f.read()?.status).toBe("failed"); expect(resolutions()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.write).toHaveBeenCalledTimes(2); expect(resolutions()).toEqual(["timed_out"]);
    expect(seen.at(-1)?.detail?.ref).toBe("person.deadline"); log.mockRestore();
  });

  it("finishes partial deletion cancellation without deleting or resolving before persistence succeeds", async () => {
    const f = fixture(); const error = new Error("cancel index refused");
    f.write.mockImplementationOnce(async (_project, value) => { f.replace(value); throw error; });
    const remove = vi.fn(async () => undefined);
    await expect(f.clock.withProjectRemoval("project.one", remove)).rejects.toBe(error);
    expect(f.read()?.status).toBe("cancelled"); expect(remove).not.toHaveBeenCalled(); expect(resolutions()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.write).toHaveBeenCalledTimes(2); expect(resolutions()).toEqual(["cancelled"]);
    await f.clock.withProjectRemoval("project.one", remove);
    expect(remove).toHaveBeenCalledOnce(); expect(resolutions()).toEqual(["cancelled"]);
  });

  it("does not overwrite newer work when a partial settlement retries", async () => {
    const f = fixture(); f.write.mockImplementationOnce(async (_project, value) => { f.replace(value); throw new Error("index refused"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    f.clock.track("project.one", f.read()!); await vi.advanceTimersByTimeAsync(100);
    const moved = { ...f.read()!, status: "succeeded" as const };
    f.replace(moved); await vi.advanceTimersByTimeAsync(1_000);
    expect(f.read()).toBe(moved); expect(f.write).toHaveBeenCalledOnce(); expect(resolutions()).toEqual([]); log.mockRestore();
  });

  it("completes a partial direct cancellation on retry without aborting or resolving twice", async () => {
    const f = fixture(); const error = new Error("cancel detail refused"); const abort = vi.fn();
    f.write.mockImplementationOnce(async (_project, value) => { f.replace(value); throw error; });
    await expect(f.clock.cancel("project.one", "run.one", "Stopped", abort)).rejects.toBe(error);
    expect(resolutions()).toEqual([]);
    expect(await f.clock.cancel("project.one", "run.one", "Stopped", abort)).toMatchObject({ status: "cancelled" });
    expect(f.write).toHaveBeenCalledTimes(2); expect(abort).toHaveBeenCalledOnce(); expect(resolutions()).toEqual(["cancelled"]);
  });

});
