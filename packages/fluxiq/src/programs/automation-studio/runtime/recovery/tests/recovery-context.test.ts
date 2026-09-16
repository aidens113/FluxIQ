import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import {
  AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS,
  buildAutomationStudioRuntimeRecoveryContext,
  type AutomationStudioRecoveryContextSection
} from "../recovery-context.ts";
import { summarizeAutomationStudioRuntimeRecoveryContext } from "../recovery-context-summary.ts";

describe("buildAutomationStudioRuntimeRecoveryContext", () => {
  it("names every section exactly once, as included or as omitted with a reason", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt() });
    const named = [...context.included.map((entry) => entry.section), ...context.omitted.map((entry) => entry.section)];
    expect(named.slice().sort()).toEqual([...AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS].sort());
    expect(new Set(named).size).toBe(AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.length);
    expect(Object.keys(context.sections).sort()).toEqual(context.included.map((entry) => entry.section).sort());
  });

  it("keeps the included sections in the contract's fixed priority order", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt() });
    const positions = context.included.map((entry) => AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.indexOf(entry.section));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(context.included[0]?.section).toBe("failure");
  });

  it("carries the failure record's category, code and short texts, and never the attempt's prose", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt() });
    expect(context.sections.failure).toMatchObject({
      nodeId: "node.checkout",
      failure: { category: "target_not_found", code: "web.target.selector_miss", retryable: false, expected: "a Pay button", actual: "no matching control" }
    });
    expect(JSON.stringify(context.sections.failure)).not.toContain("Could not click");
  });

  it("carries expected and actual transitions as ids and types, never as resolved values", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt() });
    expect(context.sections.expected_transition).toMatchObject({ expectedRoute: "success", expectedOutputIds: ["orderId"], expectedState: { conditions: [{ kind: "url_contains" }] } });
    expect(context.sections.actual_transition).toMatchObject({ status: "failed", actualOutputIds: ["partial"], comparisonStatus: "target_not_found" });
    const serialized = JSON.stringify(context.sections);
    expect(serialized).not.toContain("ORD-99887");
    expect(serialized).not.toContain("secret-session-token");
  });

  it("carries the state diff off the persisted run record", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt() });
    expect(context.sections.state_diff).toMatchObject({ stateDiff: { schemaVersion: "web-state-diff.v2", removedElementCount: 1 } });
    expect(context.omitted.find((entry) => entry.section === "state_diff")).toBeUndefined();
  });

  it("records a state diff the run never captured as absent, not as withheld or dropped", () => {
    const detail = runDetail();
    delete (detail.actionAttempts![1]!.metadata as JsonObject).stateRefs;
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: traceAttempt() });
    expect(context.sections.state_diff).toBeUndefined();
    expect(context.omitted).toContainEqual({ section: "state_diff", reason: "absent", byteCount: 0 });
  });

  it("records a state diff Core refuses to carry as withheld, not as absent", () => {
    const detail = runDetail();
    (detail.actionAttempts![1]!.metadata as JsonObject).stateRefs = { stateDiff: { schemaVersion: "web-state-diff.v2", selector: "#pay-now" } };
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: traceAttempt() });
    expect(context.sections.state_diff).toBeUndefined();
    expect(context.omitted).toContainEqual({ section: "state_diff", reason: "withheld", byteCount: 0 });
    expect(JSON.stringify(context)).not.toContain("#pay-now");
  });

  it("records a section the byte budget forced out as byte_budget, with what it cost", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(), byteBudget: 1_500 });
    const dropped = context.omitted.filter((entry) => entry.reason === "byte_budget");
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((entry) => entry.byteCount > 0)).toBe(true);
    // The three readings must stay distinguishable in the same context.
    expect(new Set(context.omitted.map((entry) => entry.reason)).size).toBeGreaterThan(1);
  });

  it("drops lowest priority first and stays inside the budget it was given", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(), byteBudget: 1_800 });
    expect(context.byteCount).toBeLessThanOrEqual(context.byteBudget);
    const droppedPositions = context.omitted
      .filter((entry) => entry.reason === "byte_budget")
      .map((entry) => AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.indexOf(entry.section));
    const keptPositions = context.included.map((entry) => AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.indexOf(entry.section));
    expect(Math.min(...droppedPositions)).toBeGreaterThan(Math.max(...keptPositions));
  });

  it("clamps a budget no context could hold up to the floor rather than discarding the record of what was withheld", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(), byteBudget: 1 });
    expect(context.byteBudget).toBe(1_500);
    expect(context.omitted.length + context.included.length).toBe(AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.length);
  });

  it("summarizes the failed target without the candidate id the domain minted", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt() });
    expect(context.sections.failed_target).toMatchObject({ status: "no_match", candidateCount: 12, minimumConfidence: 0.6, failedSignals: ["testId"] });
    expect(JSON.stringify(context.sections.failed_target)).not.toContain("candidate.7");
  });

  it("carries known adaptations as identity and verdict, never as the repair to copy", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(), adaptations: [adaptation()] });
    expect(context.sections.known_adaptations).toMatchObject({
      adaptations: [{ adaptationId: "adaptation.1", status: "validated", riskLevel: "low", validationsSucceeded: 1, validationsFailed: 0 }]
    });
    const serialized = JSON.stringify(context.sections.known_adaptations);
    expect(serialized).not.toContain("temporary_target_override");
    expect(serialized).not.toContain("legacy-handle");
  });

  it("carries the subflow and router context the runtime call never passed before", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(), subflowId: "subflow.checkout" });
    expect(context.sections.subflow).toMatchObject({ currentSubflowId: "subflow.checkout" });
    expect(context.sections.route_context).toMatchObject({ decisions: [{ routerId: "router.1", selectedRuleId: "rule.guest" }] });
  });

  it("records the recovery ladder the run already computed", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt() });
    expect(context.sections.recovery_candidates).toMatchObject({ candidates: [{ kind: "reroute", priority: 1 }] });
  });

  it("marks every section absent when the run produced nothing at all", () => {
    const empty: AutomationStudioFlowRunDetail = { schemaVersion: "0.1", summary: runDetail().summary, routeDecisions: [], subflows: [], interventions: [], adaptationIds: [], changeProposalIds: [] };
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: empty });
    expect(context.included).toEqual([]);
    expect(context.omitted.map((entry) => entry.reason)).toEqual(AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.map(() => "absent"));
  });
});

describe("summarizeAutomationStudioRuntimeRecoveryContext", () => {
  it("reports names, counts and reasons and carries no section content", () => {
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(), adaptations: [adaptation()] });
    const summary = summarizeAutomationStudioRuntimeRecoveryContext(context);
    expect(summary).toMatchObject({ schemaVersion: "automation-studio.recovery-context-summary.v1", contextSchemaVersion: context.schemaVersion, byteBudget: 4_000 });
    expect(summary.includedCount).toBe(context.included.length);
    const serialized = JSON.stringify(summary);
    for (const fragment of ["node.checkout", "web.target.selector_miss", "web-state-diff.v2", "router.1", "adaptation.1", "orderId", "a Pay button"]) {
      expect(serialized).not.toContain(fragment);
    }
    // Only section names, the two schema versions, the reasons and numbers.
    const allowed = new Set<string>([...AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS, "absent", "byte_budget", "withheld", summary.schemaVersion, summary.contextSchemaVersion]);
    for (const value of JSON.parse(serialized).included.map((entry: { section: string }) => entry.section)) expect(allowed.has(value)).toBe(true);
  });

  it("says the budget truncated the context only when a section was actually dropped for size", () => {
    const whole = summarizeAutomationStudioRuntimeRecoveryContext(buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt() }));
    const trimmed = summarizeAutomationStudioRuntimeRecoveryContext(buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(), byteBudget: 1_500 }));
    expect(whole.budgetTruncated).toBe(false);
    expect(trimmed.budgetTruncated).toBe(true);
    expect(whole.omitted.every((entry) => entry.reason !== "byte_budget")).toBe(true);
  });

  it("distinguishes a context that lost a section from one that never had it", () => {
    const withoutDiff = runDetail();
    delete (withoutDiff.actionAttempts![1]!.metadata as JsonObject).stateRefs;
    const absent = summarizeAutomationStudioRuntimeRecoveryContext(buildAutomationStudioRuntimeRecoveryContext({ detail: withoutDiff, failedAttempt: traceAttempt(), adaptations: [adaptation()], byteBudget: 16_000 }));
    const dropped = summarizeAutomationStudioRuntimeRecoveryContext(buildAutomationStudioRuntimeRecoveryContext({ detail: runDetail(), failedAttempt: traceAttempt(), adaptations: [adaptation()], byteBudget: 1_500 }));
    const reason = (summary: typeof absent, section: AutomationStudioRecoveryContextSection): string | undefined =>
      summary.omitted.find((entry) => entry.section === section)?.reason;
    // The same section name, two different readings: the run captured none,
    // against the budget having taken one the run did capture.
    expect(reason(absent, "state_diff")).toBe("absent");
    expect(reason(dropped, "state_diff")).toBe("byte_budget");
    expect(reason(absent, "recording_context")).toBe(undefined);
  });
});

function runDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { runId: "run.1", flowId: "flow.1", projectId: "project.1", status: "failed", startedAt: 1, updatedAt: 9 } as AutomationStudioFlowRunDetail["summary"],
    routeDecisions: [{ decisionId: "decision.1", routerId: "router.1", selectedRuleId: "rule.guest", rejectedRuleIds: ["rule.member"], decidedAt: 2 }],
    subflows: [{ entryId: "entry.1", subflowId: "subflow.checkout", enteredAt: 2, status: "running" }],
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
        comparisonStatus: "target_not_found",
        message: "Could not click the Pay button.",
        failure: { category: "target_not_found", code: "web.target.selector_miss", retryable: false, stage: "target_resolution", expected: "a Pay button", actual: "no matching control" },
        metadata: {
          stateRefs: {
            stateDiff: { schemaVersion: "web-state-diff.v2", locationChanged: false, beforeElementCount: 14, afterElementCount: 13, addedElementCount: 0, removedElementCount: 1 }
          },
          targetResolution: { status: "no_match", candidateCount: 12, minimumConfidence: 0.6, candidateId: "candidate.7", failedSignals: ["testId"] }
        }
      }
    ],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}

function traceAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "attempt.2",
    nodeId: "node.checkout",
    definitionId: "web.output.dom-click",
    startedAt: 3,
    finishedAt: 4,
    status: "failed",
    route: "failed",
    // Live values: the context must read none of these.
    inputs: { sessionToken: "secret-session-token" },
    outputs: { partial: "ORD-99887" },
    effects: [{ type: "policy.output.dispatch" }],
    transitionComparison: {
      comparisonId: "attempt.2.comparison",
      nodeId: "node.checkout",
      attemptId: "attempt.2",
      status: "target_not_found",
      expected: {
        transitionId: "attempt.2.expected",
        nodeId: "node.checkout",
        definitionId: "web.output.dom-click",
        expectedRoute: "success",
        expectedStatus: "succeeded",
        expectedOutputs: { orderId: "ORD-99887" },
        expectedEffects: [{ type: "policy.output.dispatch" }],
        expectedState: { conditions: [{ kind: "url_contains" }] }
      },
      actual: {
        transitionId: "attempt.2.actual",
        nodeId: "node.checkout",
        definitionId: "web.output.dom-click",
        status: "failed",
        route: "failed",
        outputs: { partial: "ORD-99887" },
        effects: [],
        startedAt: 3
      },
      diffSummary: { missingOutputIds: ["orderId"], unexpectedOutputIds: [], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: false, statusMatched: false, stateCheckCount: 1 }
    },
    recoveryDecision: {
      lookup: { nodeId: "node.checkout", definitionId: "web.output.dom-click", attemptId: "attempt.2", comparisonStatus: "target_not_found" },
      candidates: [{ kind: "reroute", priority: 1, label: "Retry through the guest route", reason: "A guest route exists from this node." }]
    }
  };
}

function adaptation(): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.1",
    flowId: "flow.1",
    projectId: "project.1",
    trigger: "target_not_found",
    failedAction: { nodeId: "node.checkout", definitionId: "web.output.dom-click" },
    patch: [{ kind: "temporary_target_override", targetNodeId: "node.checkout", target: { handles: { element: "legacy-handle" } }, reason: "drift" } as unknown as AutomationStudioFlowAdaptation["patch"][number]],
    validationResults: [{ runId: "run.0", status: "succeeded", checkedAt: 5 }],
    sourceRecordingIds: ["recording.1"],
    status: "validated",
    author: "llm",
    riskLevel: "low",
    createdAt: 5,
    updatedAt: 6
  };
}
