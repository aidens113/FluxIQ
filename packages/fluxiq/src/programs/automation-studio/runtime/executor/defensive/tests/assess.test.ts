import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { EXPECTATION_REJECTED_FAILURE } from "../../../../nodes/policy/index.ts";
import { compareAutomationStudioTransition } from "../../transition-comparison.ts";
import { AUTOMATION_STUDIO_EXPECTED_FACTS_FALSE_FAILURE, automationStudioAssessAttemptFault, automationStudioFaultFromResultMessage } from "../index.ts";

function attempt(overrides: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "act.attempt.1",
    nodeId: "act",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    ...overrides
  };
}

function node(overrides: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode {
  return { id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.act" }, ...overrides };
}

const TIMEOUT: AutomationStudioFailureRecord = { category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution" };
const BLOCKED: AutomationStudioFailureRecord = { category: "unexpected_state", code: "web.action.blocked", retryable: false, stage: "execution" };

describe("what the policy reads a failed attempt from", () => {
  it("asks the producer's own record first, and reports both answers with a reason", () => {
    const absorbed = automationStudioAssessAttemptFault(attempt({ failure: TIMEOUT }), node());
    const refused = automationStudioAssessAttemptFault(attempt({ failure: BLOCKED }), node());

    expect(absorbed).toMatchObject({ disposition: "retry", source: "failure_record", code: "web.action.timeout" });
    expect(absorbed?.reason).toContain("retryable");
    expect(refused).toMatchObject({ disposition: "refuse", source: "failure_record" });
    expect(refused?.reason).toContain("not retryable");
  });

  it("reads the message of a node that reported no record at all, which is every custom node", () => {
    const assessed = automationStudioAssessAttemptFault(attempt({ message: "Upstream replied with status 503" }), node());

    expect(assessed).toMatchObject({ disposition: "retry", source: "result_message", httpStatus: 503 });
    expect(assessed?.reason).toContain("no structured failure");
  });

  it("does not invent a fault from a message that states nothing", () => {
    expect(automationStudioFaultFromResultMessage("The click failed.")).toBeUndefined();
    expect(automationStudioAssessAttemptFault(attempt({ message: "The click failed." }), node())).toBeUndefined();
    expect(automationStudioAssessAttemptFault(attempt({}), node())).toBeUndefined();
  });

  it("reads nothing at all from an attempt that did not fail", () => {
    expect(automationStudioAssessAttemptFault(attempt({ status: "succeeded", failure: TIMEOUT }), node())).toBeUndefined();
  });

  it("prefers the classification taken where the fault happened over anything re-derived", () => {
    const stamped = automationStudioAssessAttemptFault(
      attempt({
        message: "Upstream replied with status 503",
        fault: { disposition: "retry", category: "action_failed", code: "executor.fault.transport.econnrefused", source: "thrown_error", effect: "unacted", reason: "The node threw ECONNREFUSED." }
      }),
      node()
    );

    expect(stamped?.code).toBe("executor.fault.transport.econnrefused");
    expect(stamped?.effect).toBe("unacted");
  });
});

describe("a retry must not become a second act", () => {
  it("refuses a failure found after the action ran when the node acts on the world", () => {
    for (const stage of ["confirmation", "verification"] as const) {
      const assessed = automationStudioAssessAttemptFault(attempt({ failure: { category: "output_not_observed", code: "web.validation.missing", retryable: true, stage } }), node({ metadata: { destructive: true } }));

      expect(assessed?.disposition).toBe("refuse");
      expect(assessed?.reason).toContain("after the action had already run");
    }
  });

  it("looks again when repeating cannot act, which is the failure eleven of eighteen live runs died on", () => {
    // `web.validation.output_not_observed` is declared retryable and was discarded
    // on its stage alone. A list that came back empty because the page had not
    // finished drawing is the commonest live failure there is.
    const unmetPostCondition = attempt({ failure: { category: "output_not_observed", code: "web.validation.output_not_observed", retryable: true, stage: "verification" } });
    const readsRows = node({ parameterValues: { outputId: "output.act", recordOutput: { datasetId: "rows" } } });
    const checksState = node({ id: "check", definitionId: "builtin.policy.expectation", parameterValues: {} });

    // A node carrying rows out: reading them again presses nothing.
    expect(automationStudioAssessAttemptFault(unmetPostCondition, readsRows)?.disposition).toBe("retry");
    // A node that touches nothing outside the run at all.
    expect(automationStudioAssessAttemptFault(unmetPostCondition, checksState)?.disposition).toBe("retry");
    // A node that states it only observes keeps its retries even when it looks consequential.
    expect(automationStudioAssessAttemptFault(unmetPostCondition, node({ metadata: { destructive: true, effect: "observe" } }))?.disposition).toBe("retry");
  });

  it("does not look again at an output that says nothing about itself, so a press is never repeated", () => {
    // Core cannot tell a read from a press, and the runtime downstream takes care
    // never to press twice. A domain marks its read verbs `effect: "observe"`.
    const unmetPostCondition = attempt({ failure: { category: "output_not_observed", code: "web.validation.output_not_observed", retryable: true, stage: "verification" } });
    const assessed = automationStudioAssessAttemptFault(unmetPostCondition, node());

    expect(assessed?.disposition).toBe("refuse");
    expect(assessed?.reason).toContain("could not act a second time");
  });

  it("keeps the refusal when the caller names no node at all", () => {
    // With no node there is no positive reason to look again, so it gives the
    // cautious answer rather than the useful one.
    const assessed = automationStudioAssessAttemptFault(attempt({ failure: { category: "output_not_observed", code: "web.validation.missing", retryable: true, stage: "verification" } }), undefined);

    expect(assessed?.disposition).toBe("refuse");
  });

  it("refuses to repeat an act on the world when the fault may already have landed", () => {
    const spends = node({ metadata: { destructive: true } });
    const assessed = automationStudioAssessAttemptFault(attempt({ fault: { disposition: "retry", category: "action_failed", code: "executor.fault.transport.econnreset", source: "thrown_error", effect: "ambiguous", reason: "dropped" } }), spends);

    expect(assessed?.disposition).toBe("refuse");
    expect(assessed?.reason).toContain("may already have landed");
  });

  it("repeats an act on the world freely when nothing could have accepted the request", () => {
    const spends = node({ metadata: { destructive: true } });
    const assessed = automationStudioAssessAttemptFault(attempt({ fault: { disposition: "retry", category: "action_failed", code: "executor.fault.transport.econnrefused", source: "thrown_error", effect: "unacted", reason: "refused" } }), spends);

    expect(assessed?.disposition).toBe("retry");
  });

  it("repeats an ambiguous fault on a mutating node that states repeating is safe", () => {
    const ambiguous = attempt({ fault: { disposition: "retry", category: "action_failed", code: "executor.fault.transport.econnreset", source: "thrown_error", effect: "ambiguous", reason: "dropped" } });

    expect(automationStudioAssessAttemptFault(ambiguous, node({ metadata: { destructive: true, idempotent: true } }))?.disposition).toBe("retry");
    expect(automationStudioAssessAttemptFault(ambiguous, node({ metadata: { destructive: true, idempotencyKey: "order-7741" } }))?.disposition).toBe("retry");
  });

  it("leaves a plain domain output retryable, because most of them read rather than act", () => {
    // `automationStudioNodeSideEffectClass` calls every domain output external, and
    // is right to: that is what a host is told. Reading it as a mutation here would
    // switch retries off for the whole of web automation.
    const assessed = automationStudioAssessAttemptFault(attempt({ fault: { disposition: "retry", category: "action_failed", code: "executor.fault.transport.econnreset", source: "thrown_error", effect: "ambiguous", reason: "dropped" } }), node());

    expect(assessed?.disposition).toBe("retry");
  });

  it("treats an output a person has to sanction as an act on the world", () => {
    const gated = node({ parameterValues: { outputId: "output.pay", requiresApproval: true } });
    const assessed = automationStudioAssessAttemptFault(attempt({ fault: { disposition: "retry", category: "action_failed", code: "executor.fault.transport.econnreset", source: "thrown_error", effect: "ambiguous", reason: "dropped" } }), gated);

    expect(assessed?.disposition).toBe("refuse");
  });
});

describe("a press the page refused and said so", () => {
  // social-network-feed: a fourth Confirm inside the page's rolling window opens
  // "You're going too fast ... try again in 12 seconds" and confirms nothing. The
  // record says the act did not happen and how long to wait; without both the
  // Flow read three accepted of four.
  const refused: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted", retryAfterMs: 12_500 };

  it("is repeated on a node that acts on the world, after the wait the page asked for", () => {
    const assessed = automationStudioAssessAttemptFault(attempt({ failure: refused }), node({ metadata: { destructive: true } }), 0);

    expect(assessed).toMatchObject({ disposition: "retry", effect: "unacted", code: "web.action.rate_limited", hintedWaitMs: 12_500 });
  });

  it("stays refused on such a node when the producer states nothing about the act", () => {
    const silent: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", retryAfterMs: 12_500 };
    const assessed = automationStudioAssessAttemptFault(attempt({ failure: silent }), node({ metadata: { destructive: true } }), 0);

    expect(assessed).toMatchObject({ disposition: "refuse", effect: "ambiguous" });
  });

  it("repeats a timed-out press whose step declared no lasting consequence, though the producer says it may have acted", () => {
    const timedOut: AutomationStudioFailureRecord = { category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution", effect: "ambiguous" };

    expect(automationStudioAssessAttemptFault(attempt({ failure: timedOut }), node({ metadata: { declaredConsequences: [] } }), 0)?.disposition).toBe("retry");
    expect(automationStudioAssessAttemptFault(attempt({ failure: timedOut }), node({ metadata: { declaredConsequences: ["send_or_publish"] } }), 0)).toMatchObject({ disposition: "refuse", actUncertain: true });
    expect(automationStudioAssessAttemptFault(attempt({ failure: timedOut }), node(), 0)).toMatchObject({ disposition: "refuse", actUncertain: true });
    expect(automationStudioAssessAttemptFault(attempt({ failure: timedOut }), node({ metadata: { declaredConsequences: [], destructive: true } }), 0)).toMatchObject({ disposition: "refuse", actUncertain: true });
  });

  it("holds the page's wait to the runtime's own bound", () => {
    const assessed = automationStudioAssessAttemptFault(attempt({ failure: { ...refused, retryAfterMs: 600_000 } }), node(), 0);

    expect(assessed?.hintedWaitMs).toBe(60_000);
  });
});

describe("a delay stated in what the node returned", () => {
  it("is carried onto the assessment so the wait can honour it", () => {
    const assessed = automationStudioAssessAttemptFault(attempt({ failure: TIMEOUT, outputs: { retryAfter: 2 } }), node(), 0);

    expect(assessed?.hintedWaitMs).toBe(2_000);
  });
});

// t413: an act that answered success, then failed by the host's verdict on its expected state -- its step's own
// `done when:` facts, or the evaluator's conditions -- as the transition comparison demotes it.
describe("a press rejected by its expected state after it answered success", () => {
  const webPress = (declaredConsequences: string[]) => node({ definitionId: "web.output.dom-click", metadata: { declaredConsequences } });
  const demoted = (failure: AutomationStudioFailureRecord) => {
    const succeeded = attempt({ status: "succeeded", route: "success" });
    return attempt({ failure, transitionComparison: compareAutomationStudioTransition(webPress([]), succeeded, { passed: false, failure }) });
  };

  it.each([
    ["its step's own facts", AUTOMATION_STUDIO_EXPECTED_FACTS_FALSE_FAILURE],
    ["the evaluator's conditions", EXPECTATION_REJECTED_FAILURE]
  ])("refuses a lasting act rejected by %s, with no uncertain outcome to check: it happened, and is never made again", (_by, failure) => {
    const assessed = automationStudioAssessAttemptFault(demoted({ ...failure }), webPress(["modify_existing"]));
    expect(assessed).toMatchObject({ disposition: "refuse", stage: "verification", code: failure.code });
    expect(assessed?.actUncertain).toBeUndefined();
  });

  it("retries a step that declared nothing lasting, as any verification failure on a web node", () => {
    expect(automationStudioAssessAttemptFault(demoted({ ...AUTOMATION_STUDIO_EXPECTED_FACTS_FALSE_FAILURE }), webPress([]))).toMatchObject({ disposition: "retry" });
  });

  it("leaves a lasting act's failure the host did not judge after a success to the uncertain-outcome rule", () => {
    expect(automationStudioAssessAttemptFault(attempt({ failure: { ...EXPECTATION_REJECTED_FAILURE } }), webPress(["modify_existing"]))?.actUncertain).toBe(true);
  });
});
