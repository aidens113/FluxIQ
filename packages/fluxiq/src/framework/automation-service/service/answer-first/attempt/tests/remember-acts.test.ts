// What the ending writes of the act record into task memory: an achieved ending marks the acts that
// stood (`runtime/answer-first/act-record/done-in-achieved.ts`), any other leaves them as they were.

import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstRemember } from "../remember.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "../rounds.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "../state.ts";

const landed = { effectApplied: true, words: { what: "Added", where: "On the page" } };

async function acts(ending: AutomationStudioAnswerFirstRoundsEnding, attemptId: string, scope?: string) {
  const record = new AutomationStudioAttemptActRecord();
  record.settled({ actionId: "domain.add", parameters: { target: { handle: "h1" } }, consequences: ["modify_existing"], stage: "exploration" }, landed);
  const kept = { attemptId: "a1", flowId: "f1", data: record.data() };
  let memory: Record<string, unknown> = { attempts: [], notes: [], acts: kept, ...(scope ? { actsByScope: { [scope]: kept, other: structuredClone(kept) } } : {}) };
  const updateMemory = async (_project: string, _task: string, change: (current: unknown) => Record<string, unknown>) => {
    memory = change(memory);
    return memory;
  };
  const run = {
    input: { projectId: "p1", flowId: "f1", ...(scope ? { caller: { actScope: scope } } : {}) }, taskId: "t1", attemptId, ordinal: 1, steps: [], startedWith: [], askedAgain: false,
    route: { kind: "build" }, completion: { state: {} }, record,
    memory: { update: updateMemory }
  } as unknown as AutomationStudioAnswerFirstAttemptRun;
  const done = await automationStudioAnswerFirstRemember(run, ending, { label: "unverified", candidateId: undefined, stated: [], spend: { calls: 0, usd: 0 }, atMs: 1 });
  expect(done.ok).toBe(true);
  if (scope) {
    const scoped = memory.actsByScope as Record<string, typeof kept>;
    expect(scoped[scope]?.data).toEqual((memory.acts as typeof kept).data);
    expect(scoped.other?.data.acts[0]?.doneInAchieved).toBeUndefined();
  } else expect(memory).not.toHaveProperty("actsByScope");
  return (memory.acts as { data: { acts: { doneInAchieved?: true }[] } }).data.acts;
}

describe("the ending's write of the act record", () => {
  it("propagates a scoped completion write failure and retains unscoped best-effort behavior", async () => {
    const cause = new Error("completion storage failed");
    const run = {
      input: { projectId: "p1", flowId: "f1", caller: { actScope: "execution" } }, taskId: "t1", attemptId: "a1", ordinal: 1,
      steps: [], startedWith: [], route: { kind: "build" }, completion: { state: {} }, memory: { update: async () => { throw cause; } }
    } as unknown as AutomationStudioAnswerFirstAttemptRun;
    const ended = { label: "unverified" as const, candidateId: undefined, stated: [], spend: { calls: 0, usd: 0 }, atMs: 1 };
    await expect(automationStudioAnswerFirstRemember(run, "achieved", ended)).rejects.toBe(cause);
    delete run.input.caller;
    expect(await automationStudioAnswerFirstRemember(run, "achieved", ended)).toMatchObject({ ok: false });
  });
  it("marks the acts that stood when the attempt ended achieved", async () => {
    expect((await acts("achieved", "a1"))[0]?.doneInAchieved).toBe(true);
  });

  it.each(["budget_out", "stopped_by_person", "waiting_for_check"] as const)("leaves them unmarked when it ended %s", async (ending) => {
    expect((await acts(ending, "a1"))[0]?.doneInAchieved).toBeUndefined();
  });

  it("marks nothing of another attempt's record", async () => {
    expect((await acts("achieved", "a2"))[0]?.doneInAchieved).toBeUndefined();
  });

  it("marks the matching scope and latest record together, leaving other scopes unchanged", async () => {
    expect((await acts("achieved", "a1", "execution.first"))[0]?.doneInAchieved).toBe(true);
    expect((await acts("taken_unverified", "a1", "execution.first"))[0]?.doneInAchieved).toBe(true);
    expect((await acts("budget_out", "a1", "execution.first"))[0]?.doneInAchieved).toBeUndefined();
    expect((await acts("achieved", "a2", "execution.first"))[0]?.doneInAchieved).toBeUndefined();
  });
});
