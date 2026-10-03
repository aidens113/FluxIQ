import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { AutomationStudioProjectStoreUnavailableError } from "../../../../storage/index.ts";
import { endAutomationStudioRuntimeSessionAfterThrow, type AutomationStudioRuntimeSessionEndingPorts } from "../ending.ts";

function session(overrides: Partial<AutomationStudioRuntimeSession> = {}): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId: "run.one",
    projectId: "project.one",
    targetKind: "flow",
    targetId: "flow.one",
    flowId: "flow.one",
    status: "queued",
    queuedAt: 100,
    flow: { flowId: "flow.one" } as AutomationStudioRuntimeSession["flow"],
    metadata: { adaptiveRuntime: true },
    ...overrides
  };
}

function ports(stored: AutomationStudioRuntimeSession | null, write: AutomationStudioRuntimeSessionEndingPorts["writeRuntimeSession"] = async () => undefined) {
  return {
    getRuntimeSession: vi.fn(async () => stored),
    writeRuntimeSession: vi.fn(write),
    now: () => 500
  };
}

describe("ending a run that threw", () => {
  it("writes a queued session failed, with the error as its reason, and hands the error back", async () => {
    const failure = new Error("database is locked");
    const access = ports(session());

    await expect(endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", failure)).resolves.toEqual({ error: failure });

    expect(access.getRuntimeSession).toHaveBeenCalledWith("project.one", "run.one");
    expect(access.writeRuntimeSession).toHaveBeenCalledWith("project.one", {
      ...session(),
      status: "failed",
      finishedAt: 500,
      trace: { status: "failed", startedAt: 100, finishedAt: 500, attempts: [], values: {}, effects: [], message: "database is locked" },
      metadata: { adaptiveRuntime: true, runFailure: { at: 500, sessionStatus: "queued", reason: "database is locked" } }
    });
  });

  it("writes a running session failed from when it started, keeping what its trace already holds", async () => {
    const access = ports(session({ status: "running", startedAt: 200, trace: { status: "running", startedAt: 210, attempts: [], values: { kept: 1 }, effects: [] } }));

    await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", "not an Error");

    expect(access.writeRuntimeSession).toHaveBeenCalledWith("project.one", expect.objectContaining({
      status: "failed",
      startedAt: 200,
      finishedAt: 500,
      trace: { status: "failed", startedAt: 210, finishedAt: 500, attempts: [], values: { kept: 1 }, effects: [], message: "not an Error" },
      metadata: expect.objectContaining({ runFailure: { at: 500, sessionStatus: "running", reason: "not an Error" } })
    }));
  });

  it.each(["succeeded", "failed", "cancelled", "waiting"] as const)("leaves a %s session as it is", async (status) => {
    const failure = new Error("late");
    const access = ports(session({ status }));

    await expect(endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", failure)).resolves.toEqual({ error: failure });

    expect(access.writeRuntimeSession).not.toHaveBeenCalled();
  });

  it("does not recreate a session that is no longer stored", async () => {
    const access = ports(null);

    await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", new Error("late"));

    expect(access.writeRuntimeSession).not.toHaveBeenCalled();
  });

  it("hands back both failures when the session cannot be written", async () => {
    const failure = new Error("database is locked");
    const access = ports(session(), async () => { throw new Error("disk full"); });

    const { error: returned } = await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", failure) as { error: unknown };

    expect(returned).toBeInstanceOf(AggregateError);
    expect((returned as AggregateError).message).toBe("database is locked The run's session could not be marked failed: disk full");
    expect((returned as AggregateError).errors).toEqual([failure, new Error("disk full")]);
  });

  it("hands back both failures when the session cannot be read", async () => {
    const failure = new Error("database is locked");
    const access = { ...ports(session()), getRuntimeSession: vi.fn(async () => { throw new Error("session unreadable"); }) };

    const { error: returned } = await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", failure) as { error: unknown };

    expect((returned as AggregateError).errors).toEqual([failure, new Error("session unreadable")]);
    expect(access.writeRuntimeSession).not.toHaveBeenCalled();
  });
});

// t249 follow-up: a run that threw never reached the judgement a runtime patch
// it trialled waits for, so what it held is settled unapplied as run_errored.
describe("settling what a run that threw held for its judged end", () => {
  it("marks the session failed first, then settles, whatever state the session was in", async () => {
    const order: string[] = [];
    const access = { ...ports(session({ status: "running" }), async () => { order.push("write"); }), settleAfterThrow: vi.fn(async () => { order.push("settle"); }) };
    const failure = new Error("boom");

    await expect(endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", failure)).resolves.toEqual({ error: failure });
    expect(order).toEqual(["write", "settle"]);
    expect(access.settleAfterThrow).toHaveBeenCalledWith(expect.objectContaining({ runId: "run.one" }));

    const recorded = { ...ports(session({ status: "succeeded" })), settleAfterThrow: vi.fn(async () => undefined) };
    await endAutomationStudioRuntimeSessionAfterThrow(recorded, "project.one", "run.one", failure);
    expect(recorded.writeRuntimeSession).not.toHaveBeenCalled();
    expect(recorded.settleAfterThrow).toHaveBeenCalledTimes(1);
  });

  it("keeps the caller's error beside a settle that failed, and the session still marked failed", async () => {
    const access = { ...ports(session()), settleAfterThrow: vi.fn(async () => { throw new Error("store closed"); }) };
    const failure = new Error("boom");

    const { error: returned } = await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", failure) as { error: unknown };
    expect(returned).toBeInstanceOf(AggregateError);
    expect((returned as AggregateError).errors[0]).toBe(failure);
    expect((returned as AggregateError).message).toContain("could not be settled: store closed");
    expect(access.writeRuntimeSession).toHaveBeenCalledTimes(1);
  });

  it("settles nothing for a session that is no longer stored", async () => {
    const access = { ...ports(null), settleAfterThrow: vi.fn(async () => undefined) };
    await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", new Error("boom"));
    expect(access.settleAfterThrow).not.toHaveBeenCalled();
  });
});

// t258: a run whose project store went away ends with its session handed back,
// never by throwing the store's absence at its caller.
describe("ending a run whose project store went away", () => {
  const gone = () => new AutomationStudioProjectStoreUnavailableError("Automation Studio project database pool is closing.");

  it("hands back a session that already failed at its step, keeping that reason, and notes the store", async () => {
    const failedAtStep = session({ status: "failed", trace: { status: "failed", startedAt: 100, attempts: [], values: {}, effects: [], message: "record_output.persist_failed" } });
    const access = ports(failedAtStep);

    const ending = await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", gone());

    expect(ending).toEqual({ session: expect.objectContaining({ status: "failed", trace: expect.objectContaining({ message: "record_output.persist_failed" }) }) });
    const ended = (ending as { session: AutomationStudioRuntimeSession }).session;
    expect(ended.metadata).toMatchObject({ projectStoreUnavailable: { at: 500, sessionStatus: "failed", reason: "Automation Studio project database pool is closing." } });
    expect(ended.metadata).not.toHaveProperty("runFailure");
    expect(access.writeRuntimeSession).toHaveBeenCalledWith("project.one", ended);
  });

  it("ends a running session failed for the store, and hands it back", async () => {
    const access = ports(session({ status: "running", startedAt: 200 }));

    const ending = await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", gone());

    expect((ending as { session: AutomationStudioRuntimeSession }).session).toMatchObject({ status: "failed", metadata: { runFailure: { sessionStatus: "running" }, projectStoreUnavailable: { sessionStatus: "failed" } } });
  });

  it("hands back the session as the settle left it, and recognises the store's absence through a cause", async () => {
    const noted = session({ status: "failed", metadata: { judgedPromotionSettlement: { status: "store_unavailable" } } });
    const access = { ...ports(session({ status: "failed" })), settleAfterThrow: vi.fn(async () => noted) };

    const ending = await endAutomationStudioRuntimeSessionAfterThrow(access, "project.one", "run.one", new Error("conversation unreadable", { cause: gone() }));

    expect((ending as { session: AutomationStudioRuntimeSession }).session.metadata).toMatchObject({ judgedPromotionSettlement: { status: "store_unavailable" }, projectStoreUnavailable: { reason: "conversation unreadable" } });
  });

  it("still throws any other error, and a store error when the session cannot be written", async () => {
    const other = new Error("boom");
    await expect(endAutomationStudioRuntimeSessionAfterThrow(ports(session({ status: "failed" })), "project.one", "run.one", other)).resolves.toEqual({ error: other });

    const unwritable = ports(session({ status: "failed" }), async () => { throw new Error("disk full"); });
    const ending = await endAutomationStudioRuntimeSessionAfterThrow(unwritable, "project.one", "run.one", gone());
    expect((ending as { error: unknown }).error).toBeInstanceOf(AggregateError);
  });
});
