import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../../action-permission-requests/index.ts";
import {
  automationStudioHarnessOptionRegistry,
  type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../../llm/index.ts";
import { resolveAutomationStudioExplorationBudget } from "../exploration-budget.ts";
import {
  isAutomationStudioExplorationOutcome,
  type AutomationStudioExplorationRefusal
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

  // A refusal is no longer an ending (t1057): it is shown to the model and the exploration goes on, so the
  // confusable endings are the clock, emptiness, a fault and success.
  it("gives budget exhaustion, emptiness, a fault and success four different outcomes in one comparison", async () => {
    const runs = await Promise.all(SCENARIOS().map(async ([label, , , scenario]) => [label, await explore(scenario)] as const));
    const byLabel = new Map(runs);

    const budget = byLabel.get("run out of its own time")!;
    const empty = byLabel.get("completion that gathered nothing")!;
    const broken = byLabel.get("decision the loop cannot read")!;
    const success = await explore({ decisions: [call("test.inspect", { area: "one" }), complete({ finding: "x" })] });

    expect(new Set([budget.outcome, empty.outcome, broken.outcome, success.outcome]).size).toBe(4);
    // And the only one of the four carrying a finding is the one that found something.
    expect([budget.result, empty.result, broken.result]).toEqual([undefined, undefined, undefined]);
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
  // for an exploring run, with sixteen underneath as the loop's own ceiling;
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

  // t1049 (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS
  // EVERYTHING"). A recovery exploration whose steps bring back nothing new was stopped `no_progress` after three of
  // them (the ledger's guard), and its loop after eight (the evidence loop's). Neither count exists now: twelve steps
  // in a row that each return what the loop already holds run on, the model is told plainly what it keeps repeating,
  // and the exploration ends on its answer.
  it("keeps a loop whose steps bring back nothing new running, steered, until its answer", async () => {
    const shown: string[][] = [];
    const steps = Array.from({ length: 12 }, (_, index) => call("test.inspect", { area: `area.${index}` }));
    const run = await explore({
      decisions: [...steps, complete({ finding: "the control is absent" })],
      onDecide: (decision) => { shown.push(((decision as { evidence?: readonly { toolId: string }[] }).evidence ?? []).map((entry) => entry.toolId)); },
      execute: async () => ({ kind: "llm_evidence_tool_execution", evidence: { control: "absent" }, effectApplied: false, resultCode: "test.ok" })
    });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.stopReason).toBeUndefined();
    expect(run.endedBy).toBe("exploration.completed");
    expect(run.result).toEqual({ finding: "the control is absent" });
    expect(run.actions).toBe(12);
    expect(shown).toHaveLength(13);
    // Steered: from the third step without progress the newest decisions were shown the loop's no-progress note.
    expect(shown.at(-1)).toContain("core.no_progress");
  });

  it("keeps a loop whose steps keep coming back empty running until its answer", async () => {
    const run = await explore({
      decisions: [...Array.from({ length: 10 }, (_, index) => call("test.inspect", { area: `area.${index}` })), complete({ finding: "nothing there" })],
      execute: async () => ({ kind: "llm_evidence_tool_execution", evidence: "", effectApplied: false })
    });

    expect(run.stopReason).toBeUndefined();
    expect(run.endedBy).toBe("exploration.completed");
    expect(run.actions).toBe(10);
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

  // And a run of unusable answers well past the three that once stopped it `no_progress` (t1049): each is asked
  // again, and the exploration carries on to its answer.
  it("asks again through many unusable decisions in a row, and carries on to an answer", async () => {
    let decisions = 0;
    const run = await explore({
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "the control moved" })],
      onDecide: () => { decisions += 1; },
      unusableAt: Array.from({ length: 10 }, (_, index) => index + 1)
    });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.stopReason).toBeUndefined();
    expect(run.unusableDecisions).toBe(10);
    expect(decisions).toBe(12);
    expect(run.result).toEqual({ finding: "the control moved" });
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

  // The exploration's clock cuts off a call in flight as a timeout, which the
  // failure-disposition table reads as a spent call; a cancellation from
  // outside stays a cancellation, which it reads as the end of the model's
  // calls.
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

  it("continues after a refused action throws, without raising a mid-run permission request", async () => {
    const run = await explore({
      decisions: [call("test.reveal", { control: "Refund" }), call("test.inspect", { area: "unreached" }), complete({ finding: "unreached" })],
      execute: async (input) => {
        await input.permission({ consequences: ["move_money"], control: { name: "Refund" }, verb: "press" });
        throw new Error("the domain threw after it was refused");
      }
    });

    expect(run.outcome).toBe("no_evidence_found");
    expect(run.endedBy).toBe("exploration.completed");
    expect(run.permissionRequest).toBeUndefined();
    expect(run.accounting.iterations).toBe(3);
    expect(run.result).toBeUndefined();
  });

  // A refused action is still an action: it is recorded, by kind, and never counted as observed. A run of only
  // refusals that then completes found nothing, which is a fact, where "success" would be a claim.
  it("records refused actions, by kind, apart from the observed ones, and ends on none of them", async () => {
    const run = await explore({
      decisions: [call("test.inspect", { area: "one" }), call("test.inspect", { area: "two" }), call("test.inspect", { area: "three" }), complete({ finding: "guessed" })],
      execute: refusingExecution("test.refused.scope")
    });

    expect(run.outcome).toBe("no_evidence_found");
    expect(run.stopReason).toBeUndefined();
    expect(run.actions).toBe(3);
    expect(run.refusedActions).toBe(3);
    expect(run.refusals).toEqual({ out_of_scope_refused: 3 });
    expect(run.observedActions).toBe(0);
    expect(automationStudioExplorationTraceEvent({ requested: true, exploration: run }).detail).toMatchObject({ refusedActions: 3, refusals: { out_of_scope_refused: 3 } });
  });

  // The same refused press, asked for twenty-eight times: the refusal is shown once and every repeat is answered
  // from what the loop already holds, never run again and never an ending. The loop decision is offered from the
  // first step; asking for a person before the model has changed approach and met the repeat again is answered
  // "not yet", and the exploration goes on to its answer.
  it("answers a refused press asked for again and again from memory, and goes on to its answer", async () => {
    const pressed: string[] = [];
    const refusedPress = () => call("test.reveal", { control: "Continue" });
    const run = await explore({
      decisions: [
        call("test.inspect", { area: "one" }),
        ...Array.from({ length: 14 }, refusedPress),
        call("core.loop_decision", { decision: "change_approach", approach: "Press the other button." }),
        ...Array.from({ length: 14 }, refusedPress),
        call("core.loop_decision", { decision: "ask_person", question: "Which account is meant?", why: "Two accounts match the instruction and it names neither." }),
        complete({ finding: "the press is refused" })
      ],
      execute: async (input) => {
        if (input.toolId === "test.reveal") pressed.push(input.callId);
        return input.toolId === "test.reveal" ? refusingExecution("test.refused.destructive")(input) : defaultExecution(input);
      }
    });
    const codes = run.trace.map((step) => step.resultCode);

    expect(pressed).toHaveLength(1);
    expect(codes.filter((code) => code === "llm_evidence_loop.already_answered")).toHaveLength(27);
    expect(codes).toContain("core.loop_decision.carried_out");
    expect(codes).toContain("core.loop_decision.ask_person_not_offered");
    expect(run.outcome).toBe("evidence_gathered");
    expect(run.refusals).toEqual({ destructive_action_refused: 1 });
    expect(run.result).toEqual({ finding: "the press is refused" });
  });
});

// t1057 (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS
// EVERYTHING"). The ledger ended an exploration at 24 actions, 24 provider calls, the third attempt of one action and
// the second refusal. None of those counts ends anything now: a repeat or a refusal is told to the model, loop
// detection and the model's own loop decision follow, and only the answer, the purse, the clock or a person ends it.
describe("no count ends a recovery exploration (t1057)", () => {
  it("runs far past the old twenty-four actions and provider calls to its answer", async () => {
    let decisions = 0;
    const steps = Array.from({ length: 60 }, (_, index) => call("test.inspect", { area: `area.${index}` }));
    const run = await explore({ decisions: [...steps, complete({ finding: "the control moved" })], onDecide: () => { decisions += 1; } });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.stopReason).toBeUndefined();
    expect(run.actions).toBe(60);
    expect(decisions).toBe(61);
    expect(run.result).toEqual({ finding: "the control moved" });
  });

  it("runs a cycle of the same actions across mutations on, steered, to its answer", async () => {
    const shown: string[][] = [];
    const cycle = Array.from({ length: 6 }, () => [call("test.inspect", {}), call("test.reveal", {})]).flat();
    const run = await explore({
      decisions: [...cycle, complete({ finding: "the control appears after revealing" })],
      onDecide: (decision) => { shown.push(((decision as { evidence?: readonly { toolId: string }[] }).evidence ?? []).map((entry) => entry.toolId)); },
      execute: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { observed: input.toolId }, effectApplied: input.toolId === "test.reveal", resultCode: "test.ok" })
    });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.stopReason).toBeUndefined();
    // Past the third attempt of one action, which ended it before t1057 (four actions in). The loop's own repeat
    // guard refuses some of the twelve unrun, which is steering, not an ending.
    expect(run.actions).toBeGreaterThan(4);
    expect(run.accounting.iterations).toBe(13);
    // The ledger still keeps what was tried and how often: evidence, never a stop.
    expect(run.repeatedActions).toBe(run.actions - 2);
    // Steered: the model was told it keeps repeating itself.
    expect(shown.flat().some((toolId) => toolId === "core.no_progress" || toolId === "core.loop_check")).toBe(true);
  });

  it("runs on through refused actions, showing each refusal to the model, to its answer", async () => {
    const shown: string[] = [];
    const refused = Array.from({ length: 6 }, (_, index) => call("test.inspect", { area: `outside.${index}` }));
    const run = await explore({
      decisions: [...refused, call("test.reveal", { area: "inside" }), complete({ finding: "the control is inside" })],
      onDecide: (decision) => { shown.push(JSON.stringify((decision as { evidence?: unknown }).evidence ?? [])); },
      execute: async (input) => input.toolId === "test.inspect" ? refusingExecution("test.refused.scope")(input) : defaultExecution(input)
    });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.stopReason).toBeUndefined();
    expect(run.refusedActions).toBe(6);
    expect(run.observedActions).toBe(1);
    expect(run.result).toEqual({ finding: "the control is inside" });
    // What was refused, and why, is in front of the model on the next decision.
    expect(shown[1]).toContain("test.refused.scope");
  });

  it("still never runs a stated lasting act a third time on one target, and goes on to its answer", async () => {
    const pressed: string[] = [];
    const press = () => call("test.reveal", { control: "Save", consequences: ["send"] });
    const run = await explore({
      decisions: [press(), press(), press(), press(), call("test.inspect", { area: "after" }), complete({ finding: "saved" })],
      execute: async (input) => {
        if (input.toolId === "test.reveal") pressed.push(input.callId);
        return defaultExecution(input);
      }
    });

    expect(pressed).toHaveLength(2);
    expect(run.outcome).toBe("evidence_gathered");
    expect(run.stopReason).toBeUndefined();
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

  // A circling exploration was recorded as failed on the repeat window that stopped it at the third attempt. No
  // count stops it now (t1057): it goes on to its answer, and what it repeated is on the record as evidence.
  it("records what a circling exploration repeated, as evidence, and the answer it went on to", async () => {
    const run = await explore({
      decisions: [call("test.inspect", {}), call("test.reveal", {}), call("test.inspect", {}), call("test.reveal", {}), call("test.inspect", {}), complete({ finding: "revealed" })]
    });
    const event = automationStudioExplorationTraceEvent({ requested: true, exploration: run });

    expect(event).toMatchObject({ stage: "exploration", status: "completed" });
    expect(event.detail).toMatchObject({ outcome: "evidence_gathered", endedBy: "exploration.completed", repeatedActions: run.actions - 2 });
    expect(Number(event.detail?.repeatedActions)).toBeGreaterThan(0);
    expect(event.detail).not.toHaveProperty("stopReason");
  });

  it.each([
    ["budget_exhausted", "failed"],
    ["no_progress", "failed"],
    ["user_intervention_required", "refused"],
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
  classifyRefusal?: (resultCode: string) => AutomationStudioExplorationRefusal | undefined;
  recoveryDeadline?: ReturnType<typeof startAutomationStudioRecoveryDeadline>;
  startedAtMs?: number;
  signal?: AbortSignal;
  onDecide?: (decision: unknown) => void;
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
    // Refusals are shown to the model and end nothing (t1057), so a run of only refusals that completes found
    // nothing; the destructive and the out-of-scope kinds alike.
    ["completion after only refusals", "no_evidence_found", "exploration.completed", {
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "guessed" })],
      execute: refusingExecution("test.refused.scope")
    }],
    ["completion after a destructive action was refused", "no_evidence_found", "exploration.completed", {
      decisions: [call("test.inspect", { area: "one" }), call("test.inspect", { area: "two" }), complete({ finding: "guessed" })],
      execute: refusingExecution("test.refused.destructive")
    }],
    ["run out of its own time", "budget_exhausted", "wall_clock_expired", {
      decisions: [call("test.inspect", { area: "one" }), complete({ finding: "too late" })],
      budget: { maxDurationMs: 5_000 },
      advanceClockAfterAction: 6_000
    }],
    // A cycle across mutations once ended `repeat_window` at its third turn; it now runs on to its answer.
    ["cycle of the same action across mutations", "evidence_gathered", "exploration.completed", {
      decisions: [call("test.inspect", {}), call("test.reveal", {}), call("test.inspect", {}), call("test.reveal", {}), call("test.inspect", {}), complete({ finding: "revealed" })]
    }],
    // Only the permission gate raises `operator_approval_required`, with a
    // request in hand: here the domain asks before a consequential step and
    // the run is permitted nothing. A domain code read as that reason is reported
    // as the refusal it is (`runtime-exploration-permission.test.ts`).
    ["step a person has not allowed", "no_evidence_found", "exploration.completed", {
      decisions: [call("test.reveal", { control: "Refund" }), complete({ finding: "unreached" })],
      execute: askingExecution
    }],
    ["cancellation from outside", "cancelled", "exploration.cancelled", {
      decisions: [complete({ finding: "unreached" })],
      signal: AbortSignal.abort()
    }],
    ["decision the loop cannot read", "failed", "llm_evidence_loop.invalid_decision", { decisions: [{ kind: "something_else" }] }],
    // A failed tool is shown to the model, not the end (see the test below), and no run of them ends it either
    // (t1049): the loop goes on to the model's own completion, which found nothing.
    ["tool that kept throwing", "no_evidence_found", "exploration.completed", {
      decisions: [call("test.inspect", { area: "one" }), call("test.inspect", { area: "two" }), call("test.inspect", { area: "three" }), call("test.inspect", { area: "four" }), complete({ finding: "guessed" })],
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
function classifyTestRefusal(resultCode: string): AutomationStudioExplorationRefusal | undefined {
  if (resultCode === "test.refused.destructive") return "destructive_action_refused";
  if (resultCode === "test.refused.scope") return "out_of_scope_refused";
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
      scenario.onDecide?.(decision);
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
    repeatedActions: 0,
    unusableDecisions: 0,
    accounting: { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    trace: [],
    steps: [],
    stateDigestFailures: [],
    observedState: false,
    durationMs: 0
  };
}
