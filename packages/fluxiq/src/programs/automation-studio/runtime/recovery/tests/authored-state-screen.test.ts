// The authored expected state, as `expected_transition` discloses it.
//
// These drive `buildAutomationStudioRuntimeRecoveryContext` rather than the
// screen alone, deliberately: the claim being pinned is about what leaves in a
// request, and the screen returning a list would not prove that the request
// stopped contradicting itself. The last case reads the parameter screen beside
// it, because "the two screens on one request agree" is a claim about two
// modules and only a test that calls both can hold it.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import { automationStudioScreenedNodeParameters } from "../repair-context/index.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../context.ts";

/** A bearer credential an author could have typed into a condition. Shaped, not real. */
const BEARER = "Bearer aG9sZGVyLXRva2VuLTk5ODgtYWJjZGVm";

/** Ordinary authored prose, at and past the bound. One base string, so length is the only difference. */
const BANNER = "Thank you, your order has been placed and a confirmation email is on its way. ".repeat(4);
const BANNER_AT_BOUND = BANNER.slice(0, 240);

describe("expected_transition discloses authored state under the same guards as the parameter screen", () => {
  it("carries an ordinary expected state exactly as the Flow authored it, and names nothing", () => {
    const authored: JsonObject = {
      conditions: [{ assert: { kind: "url", expected: "/checkout/confirm" } }],
      mode: "all",
      timeoutMs: 5_000
    };
    const section = expectedTransitionFor(authored);
    expect(section.expectedState).toEqual(authored);
    expect(section.expectedStateWithheld).toBeUndefined();
  });

  it("withholds a credential an author wrote into a condition, names the path, and keeps the condition beside it", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({
      detail: runDetail(),
      failedAttempt: traceAttempt({
        conditions: [
          { assert: { kind: "url", expected: "/checkout/confirm" } },
          { assert: { kind: "text", expected: BEARER } }
        ],
        mode: "all"
      })
    });
    const section = context.sections.expected_transition as { expectedState: JsonObject; expectedStateWithheld?: string[] };
    // The whole request, not just the section: the point of the task is that the
    // value was refused three sections down and printed here.
    expect(JSON.stringify(context)).not.toContain("aG9sZGVyLXRva2Vu");
    expect(section.expectedStateWithheld).toEqual(["expectedState.conditions.1.assert.expected"]);
    expect(section.expectedState).toEqual({
      conditions: [
        { assert: { kind: "url", expected: "/checkout/confirm" } },
        // The key keeps its place, so the shape of what the author wrote survives.
        { assert: { kind: "text", expected: null } }
      ],
      mode: "all"
    });
    // A refusal inside the section must not cost the section: everything else
    // `expected_transition` carries is still there and the section is included.
    expect(section).toMatchObject({ nodeId: "node.checkout", expectedRoute: "success" });
    expect(context.omitted.find((entry) => entry.section === "expected_transition")).toBeUndefined();
  });

  it("carries an authored sentence at the bound and withholds the one past it, naming only the second", () => {
    const section = expectedTransitionFor({
      conditions: [
        { assert: { kind: "text", expected: BANNER_AT_BOUND } },
        { assert: { kind: "text", expected: BANNER } }
      ]
    });
    expect(section.expectedState).toEqual({
      conditions: [
        { assert: { kind: "text", expected: BANNER_AT_BOUND } },
        { assert: { kind: "text", expected: null } }
      ]
    });
    expect(section.expectedStateWithheld).toEqual(["expectedState.conditions.1.assert.expected"]);
  });

  it("carries a condition's numbers and flags whole, since no page and no person is in them", () => {
    const section = expectedTransitionFor({
      conditions: [{ signalPath: "cart.total", operator: "greater_than", expected: 42, required: true, weight: 0.5 }],
      timeoutMs: 8_000
    });
    expect(section.expectedState).toEqual({
      conditions: [{ signalPath: "cart.total", operator: "greater_than", expected: 42, required: true, weight: 0.5 }],
      timeoutMs: 8_000
    });
    expect(section.expectedStateWithheld).toBeUndefined();
  });

  it("records a section carrying a credential Core did not author as withheld, not as absent", () => {
    const detail = runDetail();
    // A domain's own failure prose, which is free text no key rule can see into.
    detail.actionAttempts![1]!.failure = {
      category: "target_not_found",
      code: "web.target.selector_miss",
      retryable: false,
      stage: "target_resolution",
      expected: `a Pay button reachable with ${BEARER}`,
      actual: "no matching control"
    };
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: traceAttempt() });
    expect(context.sections.failure).toBeUndefined();
    expect(context.omitted).toContainEqual({ section: "failure", reason: "withheld", byteCount: 0 });
    expect(JSON.stringify(context)).not.toContain("aG9sZGVyLXRva2Vu");
  });

  it("names the same position the parameter screen names, in the same notation", () => {
    const authored: JsonObject = {
      conditions: [
        { assert: { kind: "url", expected: "/checkout/confirm" } },
        { assert: { kind: "text", expected: BEARER } }
      ]
    };
    const section = expectedTransitionFor(authored);
    // One position, one spelling. This assertion named two spellings when it was
    // written -- this screen's dotted one and `parameter-screen.ts`'s bracketed
    // one -- because the bracketed one could not survive the locator screen and
    // that file was out of t154's scope. t160 changed the notation there, so the
    // two records now agree as a string rather than as a position a reader has to
    // translate.
    expect(automationStudioScreenedNodeParameters({ expectedState: authored }, []).withheld)
      .toContain("expectedState.conditions.1.assert.expected");
    expect(section.expectedStateWithheld).toEqual(["expectedState.conditions.1.assert.expected"]);
  });

  it("names a nested path in a form the locator screen leaves standing, in both sections of one request", () => {
    const authored: JsonObject = { conditions: [{ assert: { kind: "text", expected: BEARER } }] };
    // This pinned the sibling's loss when it was written: `step_parameters` minted
    // `expectedState.conditions[0].assert.expected`, a `.` after a `]` satisfies
    // the class-selector shape, and the path reached the model as
    // `[locator withheld]`. It now pins the fix from the same side -- the marker
    // appears in no step's record, and the position arrives whole in both
    // sections. `parameter-screen.test.ts` holds the measurement of what the
    // bracketed spelling did.
    const context = buildAutomationStudioRuntimeRecoveryContext({
      detail: runDetail(),
      failedAttempt: traceAttempt(authored),
      flow: flowWithAuthoredState(authored),
      deniedEvidenceKeys: ["selector"]
    });
    const steps = (context.sections.step_parameters as { steps: Array<{ parametersWithheld?: string[] }> }).steps;
    expect(steps.some((step) => step.parametersWithheld?.includes("[locator withheld]"))).toBe(false);
    expect(steps.some((step) => step.parametersWithheld?.includes("expectedState.conditions.0.assert.expected"))).toBe(true);
    // This section's own record is intact in the same context, and now identical.
    expect((context.sections.expected_transition as ExpectedTransitionSection).expectedStateWithheld)
      .toEqual(["expectedState.conditions.0.assert.expected"]);
  });
});

type ExpectedTransitionSection = { expectedState: JsonObject; expectedStateWithheld?: string[] };

function expectedTransitionFor(expectedState: JsonObject): ExpectedTransitionSection {
  const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(expectedState) });
  return context.sections.expected_transition as ExpectedTransitionSection;
}

/** The Flow the run came from, with the same authored state on the node that failed. */
function flowWithAuthoredState(expectedState: JsonObject): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.1",
    ownerKind: "policy",
    ownerId: "flow.1",
    name: "Checkout",
    createdAt: 1,
    updatedAt: 2,
    nodes: [{ id: "node.checkout", definitionId: "web.output.dom-click", parameterValues: { expectedState } }],
    edges: []
  };
}

function runDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { runId: "run.1", flowId: "flow.1", projectId: "project.1", status: "failed", startedAt: 1, updatedAt: 9 } as AutomationStudioFlowRunDetail["summary"],
    routeDecisions: [],
    subflows: [],
    actionAttempts: [
      { attemptId: "attempt.1", nodeId: "node.cart", definitionId: "web.output.dom-click", order: 1, status: "succeeded", route: "success", startedAt: 1, finishedAt: 2 },
      {
        attemptId: "attempt.2",
        nodeId: "node.checkout",
        definitionId: "web.output.dom-click",
        order: 2,
        status: "failed",
        route: "failed",
        startedAt: 3,
        finishedAt: 4,
        comparisonStatus: "unexpected_state",
        failure: { category: "unexpected_state", code: "web.state.mismatch", retryable: false, stage: "verification", expected: "the confirmation page", actual: "the cart" }
      }
    ],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}

function traceAttempt(expectedState?: JsonObject): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "attempt.2",
    nodeId: "node.checkout",
    definitionId: "web.output.dom-click",
    startedAt: 3,
    finishedAt: 4,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    transitionComparison: {
      comparisonId: "attempt.2.comparison",
      nodeId: "node.checkout",
      attemptId: "attempt.2",
      status: "unexpected_state",
      expected: {
        transitionId: "attempt.2.expected",
        nodeId: "node.checkout",
        definitionId: "web.output.dom-click",
        expectedRoute: "success",
        expectedStatus: "succeeded",
        ...(expectedState ? { expectedState } : {})
      },
      actual: {
        transitionId: "attempt.2.actual",
        nodeId: "node.checkout",
        definitionId: "web.output.dom-click",
        status: "failed",
        route: "failed",
        outputs: {},
        effects: [],
        startedAt: 3
      },
      diffSummary: { missingOutputIds: [], unexpectedOutputIds: [], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: false, statusMatched: false, stateCheckCount: 1 }
    }
  };
}
