// A caller's execution owns its acts even after task provenance is trimmed. Unscoped chat keeps its carry rule.
import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../../task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemory } from "../../task-memory/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "../contracts.ts";
import { automationStudioAnswerFirstOpening } from "../opening.ts";

const record = new AutomationStudioAttemptActRecord();
record.settled({ actionId: "domain.save", parameters: {}, consequences: ["modify_existing"], stage: "exploration" }, { effectApplied: true, words: { what: "Saved", where: "On the site" } });
const held = { attemptId: "attempt.first", flowId: "flow.first", data: record.data() };
const caller = { taskKey: "task.from.code" };
const provenance = { attemptId: held.attemptId, flowId: held.flowId, ordinal: 1, route: "build" as const, caller: { ...caller, actScope: "first" }, steps: [] };

async function opening(scope: string | undefined, change: (memory: AutomationStudioAnswerFirstTaskMemory) => AutomationStudioAnswerFirstTaskMemory) {
  const input = {
    owner: {}, projectId: "project.1", flowId: "flow.now", instructionText: "Save it.",
    caller: { ...caller, ...(scope === undefined ? {} : { actScope: scope }) },
    stores: { paths: new AutomationStudioProjectPaths(undefined), projects: { ensureProjectStructure: async () => undefined } }
  } as unknown as AutomationStudioAnswerFirstAttemptInput;
  const memory = automationStudioAnswerFirstTaskMemoryOf(input.owner, input.stores);
  const taskId = automationStudioAnswerFirstTaskKey({ instructionText: input.instructionText, callerKey: caller.taskKey });
  await memory.update(input.projectId, taskId, change);
  return await automationStudioAnswerFirstOpening(input, { store: { list: async () => [] }, acts: { get: async () => undefined } } as unknown as Parameters<typeof automationStudioAnswerFirstOpening>[1]);
}

describe("the act record of one execution", () => {
  it("takes its own durable entry after other executions, without relying on attempt provenance", async () => {
    const result = await opening("first", (memory) => ({ ...memory, acts: { ...held, attemptId: "attempt.other" }, actsByScope: { first: held }, attempts: [] }));
    expect(result.seed?.acts).toHaveLength(1);
    expect(result.seedFrom).toBe(held.attemptId);
  });

  it("starts empty where another scope owns the latest record", async () => {
    const result = await opening("second", (memory) => ({ ...memory, acts: held, actsByScope: { first: held }, attempts: [provenance] }));
    expect(result.seed).toBeUndefined();
  });

  it.each(["constructor", "toString", "__proto__"])("never reads an inherited %s slot as an execution's acts", async (scope) => {
    const result = await opening(scope, (memory) => ({ ...memory, actsByScope: {} }));
    expect(result.seed).toBeUndefined();
    const own = await opening(scope, (memory) => ({ ...memory, actsByScope: Object.fromEntries([[scope, held]]) }));
    expect(own.seedFrom).toBe(held.attemptId);
  });

  it("preserves legacy unscoped chat and same-scope provenance, but carries no unknown scope", async () => {
    expect((await opening(undefined, (memory) => ({ ...memory, acts: held }))).seedFrom).toBe(held.attemptId);
    expect((await opening("first", (memory) => ({ ...memory, acts: held, attempts: [provenance] }))).seedFrom).toBe(held.attemptId);
    expect((await opening("first", (memory) => ({ ...memory, acts: held }))).seed).toBeUndefined();
  });
});
