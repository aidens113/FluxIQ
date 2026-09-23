import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../action-permissions/index.ts";
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
import { AutomationStudioExplorationUnusableDecisionError } from "../unusable-decision.ts";

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

  // The decision this guard exists for: an adaptation iterates for as many
  // provider calls as it needs. The old limits were two calls for a run and six
  // for an exploring grant, with sixteen underneath as the loop's own ceiling;
  // a loop that keeps finding something new runs past all three and ends
  // because it finished, not because it was counted.
  it("lets a loop that keeps learning run well past the old two-, six- and sixteen-call limits", async () => {
    let decisions = 0;
    const steps = Array.from({ length: 20 }, (_, index) => call("test.inspect", { area: `area.${index}` }));
    const run = await explore({
      decisions: [...steps, complete({ finding: "the control moved" })],
      onDecide: () => { decisions += 1; }
    });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.stopReason).toBeUndefined();
    expect(decisions).toBe(21);
    expect(run.accounting.iterations).toBe(21);
    expect(run.observedActions).toBe(20);
    expect(run.result).toEqual({ finding: "the control moved" });
  });

  // And the other half of it: a loop that has stopped getting anywhere is
  // stopped by the guard, well before any count -- here after four of its
  // twenty-four allowed actions -- and says it was going in circles rather
  // than that it ran out.
  it("stops a loop whose new requests keep returning what it already has on no_progress, not on a count", async () => {
    let decisions = 0;
    const steps = Array.from({ length: 20 }, (_, index) => call("test.inspect", { area: `area.${index}` }));
    const run = await explore({
      decisions: steps,
      onDecide: () => { decisions += 1; },
      execute: async () => ({ kind: "llm_evidence_tool_execution", evidence: { control: "absent" }, effectApplied: false, resultCode: "test.ok" })
    });

    expect(run.outcome).toBe("no_progress");
    expect(run.stopReason).toBe("no_progress");
    expect(run.endedBy).toBe("no_progress");
    expect(run.noProgressReason).toBe("repeated_evidence");
    expect(run.reason).toContain("evidence it already had");
    expect(run.actions).toBe(4);
    expect(decisions).toBe(4);
    expect(run.result).toBeUndefined();
  });

  it("stops a loop that keeps asking for the same thing across mutations on no_progress", async () => {
    const run = await explore({
      decisions: [call("test.inspect", {}), call("test.reveal", {}), call("test.inspect", {}), call("test.reveal", {}), call("test.inspect", {}), call("test.reveal", {})],
      budget: { maxRepeatsPerAction: 4 }
    });

    expect(run.outcome).toBe("no_progress");
    expect(run.noProgressReason).toBe("repeated_request");
    expect(run.reason).toContain("already asked for");
  });

  it("stops a loop whose steps keep coming back empty on no_progress", async () => {
    const run = await explore({
      decisions: Array.from({ length: 10 }, (_, index) => call("test.inspect", { area: `area.${index}` })),
      execute: async () => ({ kind: "llm_evidence_tool_execution", evidence: "", effectApplied: false })
    });

    expect(run.outcome).toBe("no_progress");
    expect(run.noProgressReason).toBe("no_new_evidence");
    expect(run.actions).toBe(3);
  });

  // The recovery's clock still binds a loop that is making progress. Guard (c)
  // is untouched by removing the call caps.
  it("still stops a progressing loop when the recovery's clock runs out part-way", async () => {
    const run = await explore({
      decisions: Array.from({ length: 20 }, (_, index) => call("test.inspect", { area: `area.${index}` })),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 1_000, maxDurationMs: 5_000 }),
      advanceClockAfterAction: 1_000
    });

    expect(run.outcome).toBe("budget_exhausted");
    expect(run.stopReason).toBe("recovery_deadline_expired");
    expect(run.noProgressReason).toBeUndefined();
    expect(run.observedActions).toBe(5);
  });

  // One reply that could not be used does not end the exploration. The call is
  // spent and admitted like any other, the decision is asked again, and the
  // loop carries on to its answer.
  it("asks again after a decision that came back unusable, and carries on to an answer", async () => {
    let decisions = 0;
    const run = await explore({
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "the control moved" })],
      onDecide: () => { decisions += 1; },
      unusableAt: [1, 3]
    });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.result).toEqual({ finding: "the control moved" });
    expect(run.unusableDecisions).toBe(2);
    expect(decisions).toBe(4);
    // The loop saw two decisions; the two unusable answers were retried beneath it.
    expect(run.accounting.iterations).toBe(2);
    expect(automationStudioExplorationTraceEvent({ requested: true, exploration: run }).detail).toMatchObject({ unusableDecisions: 2 });
  });

  // And a loop whose answers never become usable is stopped by the progress
  // guard, after three of its twenty-four allowed calls, saying why -- not by
  // the provider-call backstop.
  it("stops a loop whose decisions keep coming back unusable on no_progress, not on the call backstop", async () => {
    let decisions = 0;
    const run = await explore({
      decisions: [],
      onDecide: () => { decisions += 1; },
      unusableAt: Array.from({ length: 50 }, (_, index) => index + 1)
    });

    expect(run.outcome).toBe("no_progress");
    expect(run.stopReason).toBe("no_progress");
    expect(run.noProgressReason).toBe("unusable_decision");
    expect(run.reason).toContain("could not use");
    expect(run.unusableDecisions).toBe(3);
    expect(decisions).toBe(3);
    expect(resolveAutomationStudioExplorationBudget().maxProviderCalls).toBeGreaterThan(decisions);
    expect(run.result).toBeUndefined();
  });

  // Only the typed error is asked again. Anything else `decide` throws still
  // ends the loop at once, as a fault.
  it("ends the loop on any other decide failure, without asking again", async () => {
    let decisions = 0;
    const run = await explore({
      decisions: [],
      onDecide: () => { decisions += 1; },
      decide: async () => { throw new Error("the budget would not pay for it"); }
    });

    expect(run.outcome).toBe("failed");
    expect(run.endedBy).toBe("llm_evidence_loop.invalid_decision");
    expect(run.unusableDecisions).toBe(0);
    expect(decisions).toBe(1);
  });

  // The exploration's clock cuts off a call in flight as a timeout, which a
  // grant reads as a spent call; a cancellation from outside stays a
  // cancellation, which a grant reads as the end of its authorization.
  it("aborts a call in flight as a timeout when its clock runs out, and as a cancellation when stopped from outside", async () => {
    vi.useFakeTimers();
    try {
      const reasons: string[] = [];
      const inFlight = (decision: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        decision.signal?.addEventListener("abort", () => {
          reasons.push(String((decision.signal?.reason as { name?: unknown } | undefined)?.name));
          reject(new AutomationStudioExplorationUnusableDecisionError(["llm.provider_timeout"]));
        }, { once: true });
      });

      const timedOut = explore({ decisions: [], budget: { maxDurationMs: 5_000 }, decide: inFlight });
      await vi.advanceTimersByTimeAsync(5_000);
      const clocked = await timedOut;
      expect(clocked.outcome).toBe("budget_exhausted");
      expect(clocked.stopReason).toBe("wall_clock_expired");

      const controller = new AbortController();
      const cancelled = explore({ decisions: [], decide: inFlight, signal: controller.signal });
      await vi.advanceTimersByTimeAsync(10);
      controller.abort();
      expect((await cancelled).outcome).toBe("cancelled");

      expect(reasons).toEqual(["TimeoutError", "AbortError"]);
    } finally {
      vi.useRealTimers();
    }
  });

  // A recovery ran its loop with a thrown tool ending the exploration outright,
  // so one flaky step threw away everything the recovery had learned. It now
  // runs as a build does (`toolFailures: "observe"`): the failure is recorded
  // under its call, shown to the model with a closed code and no error text,
  // and the model tries something else.
  it("shows a tool that threw to the model under its call, and carries on", async () => {
    const shown: unknown[] = [];
    const script = [call("test.inspect", { area: "one" }), call("test.inspect", { area: "two" }), complete({ finding: "the control moved" })];
    let thrown = false;
    const run = await explore({
      decisions: [],
      decide: async (decision) => {
        shown.push((decision as { evidence?: unknown }).evidence);
        return script[shown.length - 1] ?? complete({});
      },
      execute: async (input) => {
        if (!thrown) {
          thrown = true;
          throw new Error("the host went away: secret detail");
        }
        return defaultExecution(input);
      }
    });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.result).toEqual({ finding: "the control moved" });
    expect(run.trace.map((step) => step.resultCode)).toEqual(["llm_evidence_loop.tool_failed", "test.ok", undefined]);
    const failure = JSON.stringify(shown[1]);
    expect(failure).toContain("llm_evidence_loop.tool_failed");
    expect(failure).not.toContain("secret detail");
  });

  it("still ends on the request the gate raised, however failures are handled", async () => {
    const run = await explore({
      decisions: [call("test.reveal", { control: "Refund" }), call("test.inspect", { area: "unreached" }), complete({ finding: "unreached" })],
      execute: async (input) => {
        await input.permission({ consequences: ["move_money"], control: { name: "Refund" }, verb: "press" });
        throw new Error("the domain threw after it was refused");
      }
    });

    expect(run.outcome).toBe("user_intervention_required");
    expect(run.endedBy).toBe("operator_approval_required");
    expect(run.permissionRequest?.missing).toEqual(["move_money"]);
    expect(run.accounting.iterations).toBe(1);
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

  it("records a circling exploration as failed, with what it kept doing", async () => {
    const run = await explore({
      decisions: Array.from({ length: 10 }, (_, index) => call("test.inspect", { area: `area.${index}` })),
      execute: async () => ({ kind: "llm_evidence_tool_execution", evidence: { control: "absent" }, effectApplied: false })
    });
    const event = automationStudioExplorationTraceEvent({ requested: true, exploration: run });

    expect(event).toMatchObject({ stage: "exploration", status: "failed" });
    expect(event.detail).toMatchObject({ outcome: "no_progress", endedBy: "no_progress", stopReason: "no_progress", noProgressReason: "repeated_evidence" });
  });

  it.each([
    ["budget_exhausted", "failed"],
    ["no_progress", "failed"],
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
  /** Which provider calls, counting from one, come back unusable. They consume no scripted decision. */
  unusableAt?: number[];
  /** Replaces the scripted decisions entirely. */
  decide?: (decision: { signal?: AbortSignal }) => Promise<unknown>;
};

type ExploreExecute = (input: { callId: string; toolId: string; value: JsonObject; permission: AutomationStudioActionPermissionCheck }) => Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;

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
    ["cycle of the same action across mutations", "no_progress", "repeat_window", {
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
    // Only the permission gate raises `operator_approval_required`, with a
    // request in hand: here the domain asks before a consequential step and
    // the run holds no grant. A domain code read as that reason is reported
    // as the refusal it is (`runtime-exploration-permission.test.ts`).
    ["step a person has not allowed", "user_intervention_required", "operator_approval_required", {
      decisions: [call("test.reveal", { control: "Refund" }), complete({ finding: "unreached" })],
      execute: askingExecution
    }],
    ["cancellation from outside", "cancelled", "exploration.cancelled", {
      decisions: [complete({ finding: "unreached" })],
      signal: AbortSignal.abort()
    }],
    ["decision the loop cannot read", "failed", "llm_evidence_loop.invalid_decision", { decisions: [{ kind: "something_else" }] }],
    // One failed tool is shown to the model, not the end (see the test below).
    // A run of them reaching the progress guard is.
    ["tool that kept throwing", "failed", "llm_evidence_loop.tool_failed", {
      decisions: [call("test.inspect", { area: "one" }), call("test.inspect", { area: "two" }), call("test.inspect", { area: "three" })],
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
  let providerCalls = 0;
  const execute = scenario.execute ?? defaultExecution;
  const registry = automationStudioHarnessOptionRegistry({
    binding: {
      domainId: "test.domain",
      deniedEvidenceKeys: [],
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
    decide: async (decision) => {
      scenario.onDecide?.();
      providerCalls += 1;
      if (scenario.decide) return scenario.decide(decision);
      if (scenario.unusableAt?.includes(providerCalls)) throw new AutomationStudioExplorationUnusableDecisionError(["llm.provider_malformed_response"]);
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

/** A domain that asks before a step that would move money, and acts only when told it may. */
const askingExecution: ExploreExecute = async (input) => {
  if (input.toolId === "test.reveal" && !(await input.permission({ consequences: ["move_money"], control: { name: "Refund" }, verb: "press" })).permitted) {
    return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "test.refused.permission" }, effectApplied: false, resultCode: "test.refused.permission" };
  }
  return defaultExecution(input);
};

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
    unusableDecisions: 0,
    accounting: { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    trace: [],
    steps: [],
    stateDigestFailures: [],
    observedState: false,
    durationMs: 0
  };
}
