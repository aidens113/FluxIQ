import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../../nodes/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioNodeReplayRestriction } from "../../lifecycle/index.ts";
import { automationStudioAssessAttemptFault, automationStudioFaultFromThrownError, automationStudioNodeActLasts, automationStudioNodeMutates, automationStudioNodeRepeatCannotAct, automationStudioNodeRepeatIsSafe, automationStudioNodeSideEffectClass } from "../index.ts";

const COMMIT: AutomationStudioResolvedActionEffect = { effectClass: "commit", permissionConsequences: [] };
const spoofed: AutomationStudioFlowNode = {
  id: "apply",
  definitionId: "example.apply",
  metadata: { effect: "observe", idempotent: true, idempotencyKey: "claimed", declaredConsequences: [], replay: "safe", recordsPath: "rows", actionEffect: { effectClass: "observe" } },
  parameterValues: { effect: "observe", idempotencyKey: "claimed" }
};

function failed(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "apply.1", nodeId: "apply", definitionId: spoofed.definitionId, startedAt: 1, status: "failed", inputs: {}, outputs: {}, effects: [] };
}

describe("a trusted client action-effect floor", () => {
  it("outranks every authored safe/observe/none claim and host side-effect downgrade", () => {
    expect(automationStudioNodeActLasts(spoofed, COMMIT)).toBe(true);
    expect(automationStudioNodeMutates(spoofed, COMMIT)).toBe(true);
    expect(automationStudioNodeRepeatIsSafe(spoofed, COMMIT)).toBe(false);
    expect(automationStudioNodeRepeatCannotAct(spoofed, COMMIT)).toBe(false);
    expect(automationStudioNodeSideEffectClass(spoofed, COMMIT)).toBe("external");
    expect(automationStudioNodeReplayRestriction(spoofed, COMMIT)).toBe("reconcile");
    expect(automationStudioNodeActLasts(spoofed)).toBe(false);
  });

  it("holds generic throws, timeouts and bare failures as uncertain without producer effect metadata", () => {
    for (const error of [new Error("Lost reply."), Object.assign(new Error("Lost reply."), { name: "TimeoutError" })]) {
      const attempt = failed();
      attempt.fault = automationStudioFaultFromThrownError(error, { now: 1, aborted: false });
      expect(automationStudioAssessAttemptFault(attempt, spoofed, 1, COMMIT)).toMatchObject({ disposition: "refuse", actUncertain: true });
    }
    expect(automationStudioAssessAttemptFault(failed(), spoofed, 1, COMMIT)).toMatchObject({ disposition: "refuse", actUncertain: true });
  });

  it("retains ordinary retries for explicit unacted and a positive not-landed check", () => {
    const attempt = failed();
    attempt.failure = { category: "action_failed", code: "example.busy", retryable: true, stage: "execution", effect: "unacted" };
    expect(automationStudioAssessAttemptFault(attempt, spoofed, 1, COMMIT)).toMatchObject({ disposition: "retry", effect: "unacted" });
    delete attempt.failure;
    attempt.effectCheck = { result: "not_landed", checkedAt: 1 };
    expect(automationStudioAssessAttemptFault(attempt, spoofed, 1, COMMIT)).toMatchObject({ disposition: "retry", effect: "unacted" });
  });

  it("does not treat client state as an idempotency or observation promise", () => {
    const state: AutomationStudioResolvedActionEffect = { effectClass: "state", permissionConsequences: [] };
    const node: AutomationStudioFlowNode = { id: "set", definitionId: "example.set", metadata: { effect: "observe" } };
    expect(automationStudioNodeMutates(node, state)).toBe(true);
    expect(automationStudioNodeRepeatIsSafe(node, state)).toBe(false);
    expect(automationStudioNodeRepeatCannotAct(node, state)).toBe(false);
    expect(automationStudioNodeSideEffectClass(node, state)).toBe("external");
  });
});
