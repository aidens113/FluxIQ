// The effect check's pieces (C6 step 4, C8): the assessment marks an unknown
// outcome uncertain and reads a `not_landed` check as unacted, the one hook
// answers `unknown` for a check that is missing or broke, and a graph run's
// host check never reads a missing acknowledgement as `not_landed`.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationNodeExpectationEvaluation } from "../../../../nodes/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioHostEffectCheck } from "../../transition-comparison.ts";
import { automationStudioAssessAttemptFault, automationStudioFaultFromThrownError, automationStudioRunEffectCheck, type AutomationStudioEffectCheckResult } from "../index.ts";

const INTERRUPTED_COMMIT: AutomationStudioFailureRecord = { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, stage: "execution", effect: "ambiguous" };

const press: AutomationStudioFlowNode = { id: "add", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element" } };
const safe: AutomationStudioFlowNode = { ...press, metadata: { idempotent: true } };

function failed(failure: AutomationStudioFailureRecord, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return { attemptId: "add.attempt.1", nodeId: "add", definitionId: press.definitionId, startedAt: 1, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], failure, ...extra };
}

describe("the assessment of an uncertain act", () => {
  it("marks a refused record that states the act was made and its outcome unknown as uncertain", () => {
    expect(automationStudioAssessAttemptFault(failed(INTERRUPTED_COMMIT), press)).toMatchObject({ disposition: "refuse", effect: "ambiguous", actUncertain: true });
  });

  it("leaves a refusal the page answered, and a record that states nothing, as they were", () => {
    const rejected = { category: "blocked_by_capability_or_policy", code: "web.action.rejected", retryable: false, stage: "execution", effect: "ambiguous" } as const;
    expect(automationStudioAssessAttemptFault(failed(rejected), press)?.actUncertain).toBeUndefined();
    const { effect: _stated, ...silent } = INTERRUPTED_COMMIT;
    expect(automationStudioAssessAttemptFault(failed(silent), press)?.actUncertain).toBeUndefined();
  });

  it("does not hold back a node that says repeating it is safe", () => {
    expect(automationStudioAssessAttemptFault(failed(INTERRUPTED_COMMIT), safe)?.actUncertain).toBeUndefined();
  });

  it("does not mark an unclassified throw, which carries no statement about the act", () => {
    const fault = automationStudioFaultFromThrownError(new Error("something odd"), { now: 0, aborted: false });
    const attempt = failed({ category: fault.category, code: fault.code, retryable: false, stage: "execution" }, { fault });
    expect(automationStudioAssessAttemptFault(attempt, press)?.actUncertain).toBeUndefined();
  });

  it("reads an attempt whose effect check said not_landed as unacted and retryable", () => {
    const fault = automationStudioAssessAttemptFault(failed(INTERRUPTED_COMMIT, { effectCheck: { result: "not_landed", checkedAt: 2 } }), press);
    expect(fault).toMatchObject({ disposition: "retry", effect: "unacted", code: "web.action.unknown" });
    expect(fault?.actUncertain).toBeUndefined();
  });
});

describe("the one hook", () => {
  it("answers unknown with no check, for a check that threw, and for an answer outside the three", async () => {
    expect(await automationStudioRunEffectCheck(undefined, 1, 1)).toBe("unknown");
    const broken = async (): Promise<AutomationStudioEffectCheckResult> => {
      throw new Error("page gone");
    };
    expect(await automationStudioRunEffectCheck(broken, 1, 1)).toBe("unknown");
    // A host that answers outside the vocabulary, as untyped JavaScript could.
    const maybe: AutomationStudioEffectCheckResult = JSON.parse("\"maybe\"");
    expect(await automationStudioRunEffectCheck(async () => maybe, 1, 1)).toBe("unknown");
    expect(await automationStudioRunEffectCheck(async () => "landed", 1, 1)).toBe("landed");
  });
});

describe("a graph run's host check", () => {
  const expecting = (expectedState: JsonObject): AutomationStudioFlowNode => ({ ...press, parameterValues: { ...press.parameterValues, expectedState } });
  const twoConditions = { conditions: [{ fact: "a" }, { fact: "b" }], mode: "all" };
  const check = (node: AutomationStudioFlowNode, verdict: AutomationNodeExpectationEvaluation | undefined) =>
    automationStudioHostEffectCheck(node, verdict ? { hostRuntime: { capabilities: [], expectationEvaluator: () => verdict } } : {})(failed(INTERRUPTED_COMMIT), 1);

  it("answers unknown with no expected state, and with no evaluator", async () => {
    expect(await check(press, { passed: false, checkedConditionCount: 1 })).toBe("unknown");
    expect(await check(expecting(twoConditions), undefined)).toBe("unknown");
  });

  it("answers unknown when the host judged nothing or did not say how much it judged", async () => {
    expect(await check(expecting(twoConditions), { passed: false, checkedConditionCount: 0 })).toBe("unknown");
    expect(await check(expecting(twoConditions), { passed: false })).toBe("unknown");
    expect(await check(expecting(twoConditions), { passed: true })).toBe("unknown");
  });

  it("answers landed only when every condition was judged and held, and not_landed when a judged one failed", async () => {
    expect(await check(expecting(twoConditions), { passed: true, checkedConditionCount: 2 })).toBe("landed");
    expect(await check(expecting(twoConditions), { passed: true, checkedConditionCount: 1 })).toBe("unknown");
    expect(await check(expecting(twoConditions), { passed: false, checkedConditionCount: 1 })).toBe("not_landed");
  });

  it("in any mode, answers landed when one held and not_landed only when every one was judged", async () => {
    const any = { ...twoConditions, mode: "any" };
    expect(await check(expecting(any), { passed: true, checkedConditionCount: 1 })).toBe("landed");
    expect(await check(expecting(any), { passed: false, checkedConditionCount: 1 })).toBe("unknown");
    expect(await check(expecting(any), { passed: false, checkedConditionCount: 2 })).toBe("not_landed");
  });

  it("asks with a waiting window, never zero", async () => {
    const windows: number[] = [];
    const node = expecting(twoConditions);
    const expectationEvaluator = (_conditions: unknown, _mode: string, timeoutMs: number): AutomationNodeExpectationEvaluation => {
      windows.push(timeoutMs);
      return { passed: true, checkedConditionCount: 2 };
    };
    await automationStudioHostEffectCheck(node, { hostRuntime: { capabilities: [], expectationEvaluator } })(failed(INTERRUPTED_COMMIT), 1);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toBeGreaterThan(0);
  });
});

describe("a command the client was asked about by id (C8, B3)", () => {
  const lasting: AutomationStudioFlowNode = { ...press, metadata: { declaredConsequences: ["create_new"] } };

  it("not_seen: the act never reached the client, so even a lasting step is made again", () => {
    const notSeen: AutomationStudioFailureRecord = { category: "timeout", code: "client_gateway.command_not_seen", retryable: true, stage: "dispatch", effect: "unacted" };
    const fault = automationStudioAssessAttemptFault(failed(notSeen), lasting);
    expect(fault).toMatchObject({ disposition: "retry", effect: "unacted" });
    expect(fault?.actUncertain).toBeUndefined();
  });

  it("unknown: the timeout it stays is held uncertain, so the effect check runs and nothing is pressed again", () => {
    const timedOut: AutomationStudioFailureRecord = { category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution", effect: "ambiguous" };
    expect(automationStudioAssessAttemptFault(failed(timedOut), lasting)).toMatchObject({ disposition: "refuse", actUncertain: true });
  });
});
