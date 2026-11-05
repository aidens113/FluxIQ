// What a task's memory says is saved reads as the contract's own record, and claims no more than
// the memory holds: only a whole run judged yes is `ready`.
import { describe, expect, it } from "vitest";
import { parseAutomationStudioSavedState } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstSavedStateOf, type AutomationStudioAnswerFirstSavedFlow, type AutomationStudioAnswerFirstTaskMemory } from "../index.ts";

const flow = (over: Partial<AutomationStudioAnswerFirstSavedFlow>): AutomationStudioAnswerFirstSavedFlow => ({ attemptId: "attempt.1", flowId: "flow.old", steps: [{}] as AutomationStudioAnswerFirstSavedFlow["steps"], stepsDigest: "digest", label: "confirmed", provenWhole: false, savedAtMs: 100, spend: { calls: 1, usd: 0.01 }, ...over });
const memory = (over: Partial<AutomationStudioAnswerFirstTaskMemory>): AutomationStudioAnswerFirstTaskMemory => ({ taskId: "task.1", flowId: "flow.now", notes: [], attempts: [], ...over });

describe("what a task's memory says is saved", () => {
  it("a Flow proven whole is ready, and provisional, under the Flow the task lives on", () => {
    const saved = automationStudioAnswerFirstSavedStateOf(memory({ best: flow({ provenWhole: true }) }));
    expect(saved).toEqual({ state: "ready", trust: "provisional", flowId: "flow.now", savedAtMs: 100, lastWorkedAtMs: 100 });
    expect(parseAutomationStudioSavedState(saved).ok).toBe(true);
  });

  it("an assembled draft not proven whole only partly works, even when the result was confirmed", () => {
    const saved = automationStudioAnswerFirstSavedStateOf(memory({ best: flow({ candidateId: "candidate.1" }) }));
    expect(saved).toEqual({ state: "partly_works", trust: "unproven", flowId: "flow.now", savedAtMs: 100 });
    expect(parseAutomationStudioSavedState(saved).ok).toBe(true);
  });

  it("steps that never assembled into a draft are notes only, as the attempt's own record reads them", () => {
    const saved = automationStudioAnswerFirstSavedStateOf(memory({ best: flow({}) }));
    expect(saved).toEqual({ state: "notes_only", trust: "unproven", savedAtMs: 100 });
    expect(parseAutomationStudioSavedState(saved).ok).toBe(true);
  });

  it("notes alone are notes only, dated by the newest", () => {
    const saved = automationStudioAnswerFirstSavedStateOf(memory({ notes: [{ attemptId: "a", atMs: 5, from: "core", failed: "x" }, { attemptId: "b", atMs: 9, from: "model", worked: "y" }] }));
    expect(saved).toEqual({ state: "notes_only", trust: "unproven", savedAtMs: 9 });
    expect(parseAutomationStudioSavedState(saved).ok).toBe(true);
  });

  it("nothing kept is nothing to say", () => {
    expect(automationStudioAnswerFirstSavedStateOf(undefined)).toBeUndefined();
    expect(automationStudioAnswerFirstSavedStateOf(memory({}))).toBeUndefined();
  });
});
