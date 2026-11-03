import { describe, expect, it } from "vitest";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../index.ts";
import { attemptWithHostExpectationEvaluation, automationStudioHostEffectCheck } from "../transitions/index.ts";
import { automationStudioAwaitNodeReadiness } from "../recovery/index.ts";
import { enteredAutomationFixture } from "../execution-admission/tests/frame.ts";

const node = { id: "step", definitionId: "builtin.data.constant" };
const attempt: AutomationStudioNodeAttemptTrace = { attemptId: "step.attempt.1", nodeId: node.id, definitionId: node.definitionId, startedAt: 1, finishedAt: 2, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [] };
const cases: Array<{ name: string; invoke(options: AutomationStudioGraphExecutionOptions): Promise<unknown> }> = [
  { name: "transition comparison", invoke: options => attemptWithHostExpectationEvaluation(node, attempt, options) },
  { name: "effect check", invoke: options => automationStudioHostEffectCheck(node, options)(attempt, 1) },
  { name: "readiness", invoke: options => automationStudioAwaitNodeReadiness(node, options, attempt.attemptId) }
];

describe.each(cases)("$name observed evaluator reads", entry => {
  it.each(["own", "inherited"] as const)("fences a caught %s evaluator getter without reading it", async placement => {
    const f = await enteredAutomationFixture();
    let reads = 0;
    await f.run(async options => {
      const owner = { capabilities: [] };
      Object.defineProperty(owner, "expectationEvaluator", { get() {
        reads++;
        return () => ({ passed: true });
      } });
      options.hostRuntime = placement === "own" ? owner : Object.create(owner);
      await expect(entry.invoke(options)).rejects.toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    await f.pending();
  });
});
