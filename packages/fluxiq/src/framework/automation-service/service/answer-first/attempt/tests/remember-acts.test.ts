// What the ending writes of the act record into task memory: an achieved ending marks the acts that
// stood (`runtime/answer-first/act-record/done-in-achieved.ts`), any other leaves them as they were.

import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstRemember } from "../remember.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "../rounds.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "../state.ts";

const landed = { effectApplied: true, words: { what: "Added", where: "On the page" } };

async function acts(ending: AutomationStudioAnswerFirstRoundsEnding, attemptId: string) {
  const record = new AutomationStudioAttemptActRecord();
  record.settled({ actionId: "domain.add", parameters: { target: { handle: "h1" } }, consequences: ["modify_existing"], stage: "exploration" }, landed);
  let memory: Record<string, unknown> = { attempts: [], notes: [], acts: { attemptId: "a1", flowId: "f1", data: record.data() } };
  const updateMemory = async (_project: string, _task: string, change: (current: unknown) => Record<string, unknown>) => {
    memory = change(memory);
    return memory;
  };
  const run = {
    input: { projectId: "p1", flowId: "f1" }, taskId: "t1", attemptId, ordinal: 1, steps: [], startedWith: [], askedAgain: false,
    route: { kind: "build" }, completion: { state: {} }, record,
    memory: { update: updateMemory }
  } as unknown as AutomationStudioAnswerFirstAttemptRun;
  const done = await automationStudioAnswerFirstRemember(run, ending, { label: "unverified", candidateId: undefined, stated: [], spend: { calls: 0, usd: 0 }, atMs: 1 });
  expect(done.ok).toBe(true);
  return (memory.acts as { data: { acts: { doneInAchieved?: true }[] } }).data.acts;
}

describe("the ending's write of the act record", () => {
  it("marks the acts that stood when the attempt ended achieved", async () => {
    expect((await acts("achieved", "a1"))[0]?.doneInAchieved).toBe(true);
  });

  it.each(["budget_out", "stopped_by_person", "waiting_for_check"] as const)("leaves them unmarked when it ended %s", async (ending) => {
    expect((await acts(ending, "a1"))[0]?.doneInAchieved).toBeUndefined();
  });

  it("marks nothing of another attempt's record", async () => {
    expect((await acts("achieved", "a2"))[0]?.doneInAchieved).toBeUndefined();
  });
});
