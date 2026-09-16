import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioHarnessOptionRegistry,
  type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../llm/index.ts";
import { resolveAutomationStudioExplorationBudget } from "../exploration-budget.ts";
import {
  isAutomationStudioExplorationOutcome,
  type AutomationStudioExplorationStopReason
} from "../exploration-outcome.ts";
import { startAutomationStudioRecoveryDeadline } from "../recovery-deadline.ts";
import {
  automationStudioExplorationTraceEvent,
  runAutomationStudioRuntimeExploration,
  type AutomationStudioRuntimeExploration
} from "../runtime-exploration.ts";

// Phase 2.3's load-bearing property, and the reason this phase exists: an
// exploration that ran out of budget, one that found nothing, and one that was
// refused must be tellable apart from each other and from success. Three
// separate defects this month were a failure recorded as an absence.
//
// Every case below drives the real evidence loop, through the real
// harness-option registry, with a scripted provider. Nothing is stubbed between
// the budget and the loop.
describe("runAutomationStudioRuntimeExploration", () => {
  it("ends in evidence_gathered, and carries the result, only when an action returned evidence", async () => {
    const run = await explore({ decisions: [call("test.inspect", { area: "one" }), complete({ finding: "the control moved" })] });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.endedBy).toBe("exploration.completed");
    expect(run.result).toEqual({ finding: "the control moved" });
    expect(run.observedActions).toBe(1);
    expect(run.refusedActions).toBe(0);
    expect(run.stopReason).toBeUndefined();
  });

  // The whole table in one run, so the four confusable endings are compared
  // against each other rather than each asserted alone in its own test where a
  // collapse would be invisible.
  it.each(SCENARIOS())("ends a %s in %s (%s)", async (_label, outcome, endedBy, scenario) => {
    const run = await explore(scenario);

    expect(run.outcome).toBe(outcome);
    expect(run.endedBy).toBe(endedBy);
    expect(run.reason.length).toBeGreaterThan(0);
  });

  it("gives budget exhaustion, emptiness, refusal and success four different outcomes in one comparison", async () => {
    const runs = await Promise.all(SCENARIOS().map(async ([label, , , scenario]) => [label, await explore(scenario)] as const));
    const byLabel = new Map(runs);

    const budget = byLabel.get("run out of actions")!;
    const empty = byLabel.get("completion that gathered nothing")!;
    const refused = byLabel.get("destructive action")!;
    const success = await explore({ decisions: [call("test.inspect", { area: "one" }), complete({ finding: "x" })] });

    expect(new Set([budget.outcome, empty.outcome, refused.outcome, success.outcome]).size).toBe(4);
    // And the only one of the four carrying a finding is the one that found something.
    expect([budget.result, empty.result, refused.result]).toEqual([undefined, undefined, undefined]);
    expect(success.result).toEqual({ finding: "x" });
  });

  // The mutation the scoping report named: skip the terminal outcome on abort.
  // There is no path out of the runner that returns without classifying, so an
  // ending can never be an absence.
  it("always returns exactly one named outcome, whatever stopped it", async () => {
    const runs = await Promise.all(SCENARIOS().map(([, , , scenario]) => explore(scenario)));

    for (const run of runs) {
      expect(isAutomationStudioExplorationOutcome(run.outcome)).toBe(true);
      expect(run.reason.length).toBeGreaterThan(0);
      expect(run.endedBy.length).toBeGreaterThan(0);
      expect(run.schemaVersion).toBe("automation-studio.exploration.v1");
    }
  });

  // Two clocks, one outcome, two pieces of advice. If the runner reported this
  // as `wall_clock_expired`, somebody would raise the exploration's limit and
  // the recovery would keep running out of time in exactly the same place.
  it("says the recovery's clock ran out, not this exploration's, and bills no provider call", async () => {
    let decisions = 0;
    const run = await explore({
      decisions: [complete({ finding: "never asked" })],
      onDecide: () => { decisions += 1; },
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 1_000 }),
      startedAtMs: 10_000
    });

    expect(run.outcome).toBe("budget_exhausted");
    expect(run.stopReason).toBe("recovery_deadline_expired");
    expect(decisions).toBe(0);
    expect(run.accounting.iterations).toBe(0);
    expect(run.actions).toBe(0);
  });

  it("charges refused actions against the action budget rather than only the successful ones", async () => {
    const run = await explore({
      decisions: [call("test.inspect", { area: "one" }), call("test.inspect", { area: "two" }), call("test.inspect", { area: "three" })],
      budget: { maxActions: 2, maxRefusedActions: 9 },
      execute: refusingExecution("test.refused.scope")
    });

    expect(run.outcome).toBe("budget_exhausted");
    expect(run.stopReason).toBe("action_limit");
    expect(run.actions).toBe(2);
    expect(run.refusedActions).toBe(2);
    expect(run.observedActions).toBe(0);
  });
});

describe("automationStudioExplorationTraceEvent", () => {
  it("says the stage was skipped when nothing ran, and which way", () => {
    expect(automationStudioExplorationTraceEvent({ requested: false })).toMatchObject({ stage: "exploration", status: "skipped", providerCalled: false, detail: { requested: false } });
    expect(automationStudioExplorationTraceEvent({ requested: true }).reason).toContain("none was run");
  });

  // An exploration that ran and found nothing is `completed`, not `skipped`:
  // calling it skipped is the absence standing in for the work all over again.
  it("records an exploration that ran, with its outcome and its counts and no prose from the model", async () => {
    const run = await explore({ decisions: [call("test.inspect", { area: "one" }), complete({ finding: "the control moved" })] });
    const event = automationStudioExplorationTraceEvent({ requested: true, exploration: run });

    expect(event).toMatchObject({ stage: "exploration", status: "completed", providerCalled: true, loopStage: "gather" });
    expect(event.detail).toMatchObject({ requested: true, outcome: "evidence_gathered", endedBy: "exploration.completed", actions: 1, observedActions: 1, refusedActions: 0 });
    expect(JSON.stringify(event)).not.toContain("the control moved");
  });

  it.each([
    ["budget_exhausted", "failed"],
    ["unsafe_action_blocked", "refused"],
    ["no_evidence_found", "completed"]
  ])("reports a %s exploration as a %s stage", (outcome, status) => {
    const event = automationStudioExplorationTraceEvent({
      requested: true,
      exploration: { ...blankExploration(), outcome } as AutomationStudioRuntimeExploration
    });

    expect(event.status).toBe(status);
    expect(event.detail).toMatchObject({ outcome });
  });
});

type Scenario = {
  decisions: unknown[];
  execute?: ExploreExecute;
  budget?: Parameters<typeof resolveAutomationStudioExplorationBudget>[0];
  classifyRefusal?: (resultCode: string) => AutomationStudioExplorationStopReason | undefined;
  recoveryDeadline?: ReturnType<typeof startAutomationStudioRecoveryDeadline>;
  startedAtMs?: number;
  signal?: AbortSignal;
  onDecide?: () => void;
  advanceClockAfterAction?: number;
};

type ExploreExecute = (input: { callId: string; toolId: string; value: JsonObject }) => Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;

/** Every ending, each reached a different way, in one table. */
function SCENARIOS(): Array<[string, string, string, Scenario]> {
  return [
    ["completion that gathered nothing", "no_evidence_found", "exploration.completed", { decisions: [complete({ finding: "guessed" })] }],
    ["completion after only refusals", "no_evidence_found", "exploration.completed", {
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "guessed" })],
      budget: { maxRefusedActions: 9 },
      execute: refusingExecution("test.refused.scope")
    }],
    ["run out of actions", "budget_exhausted", "action_limit", {
      decisions: [call("test.inspect", { area: "one" }), call("test.inspect", { area: "two" }), call("test.inspect", { area: "three" })],
      budget: { maxActions: 2 }
    }],
    ["run out of provider calls", "budget_exhausted", "provider_call_limit", {
      decisions: [call("test.inspect", { area: "one" }), call("test.inspect", { area: "two" }), call("test.inspect", { area: "three" })],
      budget: { maxActions: 8, maxProviderCalls: 2 }
    }],
    ["run out of its own time", "budget_exhausted", "wall_clock_expired", {
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "too late" })],
      budget: { maxDurationMs: 5_000 },
      advanceClockAfterAction: 6_000
    }],
    ["cycle of the same action across mutations", "budget_exhausted", "repeat_window", {
      decisions: [call("test.inspect", {}), call("test.reveal", {}), call("test.inspect", {}), call("test.reveal", {}), call("test.inspect", {})],
      budget: { maxActions: 8, maxRepeatsPerAction: 2 }
    }],
    ["destructive action", "unsafe_action_blocked", "destructive_action_refused", {
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "unreached" })],
      budget: { maxRefusedActions: 1 },
      execute: refusingExecution("test.refused.destructive")
    }],
    ["action outside its scope", "unsafe_action_blocked", "out_of_scope_refused", {
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "unreached" })],
      budget: { maxRefusedActions: 1 },
      execute: refusingExecution("test.refused.scope")
    }],
    ["refusal that needs a person", "user_intervention_required", "operator_approval_required", {
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "unreached" })],
      budget: { maxRefusedActions: 1 },
      execute: refusingExecution("test.refused.operator")
    }],
    ["cancellation from outside", "cancelled", "exploration.cancelled", {
      decisions: [complete({ finding: "unreached" })],
      signal: AbortSignal.abort()
    }],
    ["decision the loop cannot read", "failed", "llm_evidence_loop.invalid_decision", { decisions: [{ kind: "something_else" }] }],
    ["action that threw", "failed", "llm_evidence_loop.tool_failed", {
      decisions: [call("test.inspect", { area: "one" })],
      execute: async () => { throw new Error("the host went away"); }
    }]
  ];
}

const TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "test.inspect", description: "Observe the current state.", inputSchema: { type: "object" }, effect: "observe" },
  { toolId: "test.reveal", description: "Change the state to reveal what is hidden.", inputSchema: { type: "object" }, effect: "mutate" }
];

/**
 * The domain's own refusal codes, translated into Core's closed vocabulary.
 * Core is handed an opaque string and never learns to read one, which is what
 * keeps the semantic refusal (decision L3) in the domain that owns the meaning.
 */
function classifyTestRefusal(resultCode: string): AutomationStudioExplorationStopReason | undefined {
  if (resultCode === "test.refused.destructive") return "destructive_action_refused";
  if (resultCode === "test.refused.scope") return "out_of_scope_refused";
  if (resultCode === "test.refused.operator") return "operator_approval_required";
  return undefined;
}

async function explore(scenario: Scenario): Promise<AutomationStudioRuntimeExploration> {
  let nowMs = scenario.startedAtMs ?? 1_000;
  let index = 0;
  const execute = scenario.execute ?? defaultExecution;
  const registry = automationStudioHarnessOptionRegistry({
    binding: {
      domainId: "test.domain",
      tools: TOOLS,
      executeTool: async (input) => {
        const result = await execute(input);
        if (scenario.advanceClockAfterAction) nowMs += scenario.advanceClockAfterAction;
        return result;
      }
    }
  });
  return runAutomationStudioRuntimeExploration({
    loop: registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true }),
    decide: async () => {
      scenario.onDecide?.();
      return scenario.decisions[index++] ?? { kind: "complete", result: {} };
    },
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000, ...scenario.budget }),
    classifyRefusal: scenario.classifyRefusal ?? classifyTestRefusal,
    now: () => nowMs,
    ...(scenario.recoveryDeadline ? { recoveryDeadline: scenario.recoveryDeadline } : {}),
    ...(scenario.signal ? { signal: scenario.signal } : {})
  });
}

const defaultExecution: ExploreExecute = async (input) => ({
  kind: "llm_evidence_tool_execution",
  evidence: { observed: input.toolId, at: input.callId },
  effectApplied: input.toolId === "test.reveal",
  resultCode: "test.ok"
});

function refusingExecution(resultCode: string): ExploreExecute {
  return async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: resultCode }, effectApplied: false, resultCode });
}

let callSequence = 0;

function call(toolId: string, input: JsonObject): JsonObject {
  callSequence += 1;
  return { kind: "tool_call", callId: `call.${callSequence}`, toolId, input };
}

function complete(result: JsonObject): JsonObject {
  return { kind: "complete", result };
}

function blankExploration(): AutomationStudioRuntimeExploration {
  return {
    schemaVersion: "automation-studio.exploration.v1",
    outcome: "no_evidence_found",
    reason: "nothing",
    endedBy: "exploration.completed",
    actions: 0,
    observedActions: 0,
    refusedActions: 0,
    accounting: { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    trace: [],
    durationMs: 0
  };
}
