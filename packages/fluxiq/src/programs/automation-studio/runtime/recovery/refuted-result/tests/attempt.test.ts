// Cause 2 of the `ten-sites-r5` post-mortem: a Flow that runs cleanly and
// answers wrongly is never repaired, because the repair ladder is keyed on a
// failed attempt and a clean run has none. Both runs of that campaign made
// **zero** repair calls -- all 38 provider calls were 34 build plus 4
// verification -- while Core's own verification had recorded "does not answer"
// twice. These are the assertions that the verdict now becomes an attempt.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import type { AutomationStudioResultVerificationOutcome } from "../../../result-verification/index.ts";
import { AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID, automationStudioRefutedResultAttempt, automationStudioRefutedResultAttemptNamesNode } from "../attempt.ts";

const NOW = 5_000;

describe("automationStudioRefutedResultAttempt", () => {
  it("turns a refuted result into a failed attempt on the node the result came out of", () => {
    const attempt = automationStudioRefutedResultAttempt({ runId: "run.1", detail: cleanRun(), outcome: refuted(), now: NOW });

    expect(attempt?.trace).toMatchObject({ nodeId: "node.s5", definitionId: "web.dom.extract_list", status: "failed" });
    expect(attempt?.record).toMatchObject({ nodeId: "node.s5", status: "failed", order: 3 });
    // The failure's own record, as the verification wrote it: the category the
    // classifier reads, the stage that says it is the result and not a step,
    // and what was expected against what was seen.
    expect(attempt?.trace.failure).toEqual({
      category: "output_not_observed",
      code: "core.result.does_not_answer_request",
      retryable: false,
      stage: "verification",
      expected: "A result that answers the request the Flow was built for.",
      actual: "24 records stored, across 1 record set."
    });
    // Nothing is invented about the step itself. Every node did what it said.
    expect(attempt?.trace.inputs).toEqual({});
    expect(attempt?.trace.outputs).toEqual({});
    expect(attempt?.trace.route).toBeUndefined();
    expect(attempt?.trace.transitionComparison).toBeUndefined();
  });

  it("prefers the step that stored records over a later step that stored none", () => {
    const detail = cleanRun([
      step({ order: 1, nodeId: "node.s1", definitionId: "web.dom.click" }),
      step({ order: 2, nodeId: "node.s2", definitionId: "web.dom.extract_list", recordCount: 24 }),
      step({ order: 3, nodeId: "node.s3", definitionId: "builtin.control.merge" })
    ]);

    expect(automationStudioRefutedResultAttempt({ runId: "run.1", detail, outcome: refuted(), now: NOW })?.trace.nodeId).toBe("node.s2");
  });

  it.each([
    ["a result judged to answer", { ...refuted(), verdict: "answers" as const }],
    // `unsure` still fails the run and still must not read as a pass. It is not
    // a refutation, though: a repair planned from "nobody could tell" is a
    // change to a Flow on evidence that nothing was wrong with it.
    ["a result nobody could judge", { ...refuted(), verdict: "unsure" as const }],
    ["a verification that never happened", { schemaVersion: "automation-studio.result-verification.v1", performed: false, code: "core.result.no_model_available", reason: "None." } as AutomationStudioResultVerificationOutcome]
  ])("builds no attempt from %s", (_label, outcome) => {
    expect(automationStudioRefutedResultAttempt({ runId: "run.1", detail: cleanRun(), outcome, now: NOW })).toBeUndefined();
  });

  it("builds no attempt when the run recorded no step, because there would be no node to speak about", () => {
    expect(automationStudioRefutedResultAttempt({ runId: "run.1", detail: cleanRun([]), outcome: refuted(), now: NOW })).toBeUndefined();
  });

  it("names the step whose rows were judged", () => {
    const attempt = automationStudioRefutedResultAttempt({ runId: "run.1", detail: cleanRun(), outcome: refuted(), now: NOW })!;

    expect(automationStudioRefutedResultAttemptNamesNode(attempt.record)).toBe(true);
    expect(automationStudioRefutedResultAttemptNamesNode(attempt.trace)).toBe(true);
  });

  // Live run 38 (`run-muqilf9s-c3211328`): no step stored records, so the
  // refutation was filed under the last step that succeeded -- a navigate back
  // to the feed that ran and matched -- and read everywhere as a failed navigate.
  it("names no step when no step stored records: run 38's Flow gives no failed navigate", () => {
    const detail = cleanRun([
      step({ order: 1, nodeId: "node.s1", definitionId: "web.output.browser-navigate" }),
      step({ order: 2, nodeId: "node.s2", definitionId: "web.output.dom-click" }),
      step({ order: 3, nodeId: "node.s3", definitionId: "web.output.browser-navigate" }),
      step({ order: 4, nodeId: "node.s4", definitionId: "web.output.dom-click" }),
      step({ order: 5, nodeId: "node.s5", definitionId: "web.output.dom-click" }),
      step({ order: 6, nodeId: "node.s6", definitionId: "web.output.browser-navigate" })
    ]);

    const attempt = automationStudioRefutedResultAttempt({ runId: "run.1", detail, outcome: refuted(), now: NOW })!;

    expect(attempt.trace).toMatchObject({ nodeId: AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID, definitionId: AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID, status: "failed" });
    expect(attempt.record).toMatchObject({ attemptId: "result-verification.run.1", nodeId: AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID, order: 7, status: "failed" });
    expect((detail.actionAttempts ?? []).map((attempt) => attempt.nodeId)).not.toContain(attempt.record.nodeId);
    expect(automationStudioRefutedResultAttemptNamesNode(attempt.record)).toBe(false);
    expect(automationStudioRefutedResultAttemptNamesNode(attempt.trace)).toBe(false);
    // The failure keeps its own category and stage: it is the result's, unchanged.
    expect(attempt.trace.failure).toMatchObject({ category: "output_not_observed", stage: "verification", code: "core.result.does_not_answer_request" });
    // Timed from the end of the run, as before.
    expect(attempt.record.startedAt).toBe(1_106);
  });

  it("names no step for a run whose only record producer failed, rather than the step before it", () => {
    const detail = cleanRun([
      step({ order: 1, nodeId: "node.s1", definitionId: "web.output.browser-navigate" }),
      { ...step({ order: 2, nodeId: "node.s2", definitionId: "web.dom.extract_list", recordCount: 3 }), status: "failed" }
    ]);

    expect(automationStudioRefutedResultAttempt({ runId: "run.1", detail, outcome: refuted(), now: NOW })?.record.nodeId).toBe(AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID);
  });

  // Live lane C (`run-muw60j7c-bb7c9a62`, t274-c25b): Core's check of the rows
  // the judgement named reached the re-author's brief but not the ladder's
  // structured repair input, so a node repair weighed advice the result
  // contradicted without the lines that said so.
  it("carries Core's checked row lines into the attempt's repair input", () => {
    const checked = ["Row 3 (Sponsored earbuds) is in the result, though the judgement calls it left out."];
    const outcome = {
      ...refuted(),
      repair: {
        schemaVersion: "automation-studio.result-repair-directive.v1" as const,
        findings: [{ code: "result.rows_left_out", detail: "Two rows matching the request were left out." }],
        fix: ["Keep every row that matches the request."],
        checked
      }
    };

    const attempt = automationStudioRefutedResultAttempt({ runId: "run.1", detail: cleanRun(), outcome, now: NOW })!;

    expect(attempt.trace.inputs).toMatchObject({ resultRepair: { checked } });
  });
});

function refuted(): AutomationStudioResultVerificationOutcome {
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: true,
    verdict: "does_not_answer",
    basis: "model",
    code: "core.result.does_not_answer_request",
    reason: "The result was judged not to answer the request the Flow was built for, although every step of the run succeeded.",
    observation: "24 records stored, across 1 record set.",
    verdicts: ["does_not_answer", "does_not_answer"],
    calls: 2,
    failure: {
      category: "output_not_observed",
      code: "core.result.does_not_answer_request",
      retryable: false,
      stage: "verification",
      expected: "A result that answers the request the Flow was built for.",
      actual: "24 records stored, across 1 record set."
    }
  };
}

/** `run-mudw1ktb`'s shape: every attempt succeeded, and `failure` was null. */
function cleanRun(attempts: AutomationStudioFlowRunActionAttemptRecord[] = [
  step({ order: 1, nodeId: "node.s1", definitionId: "web.browser.navigate" }),
  step({ order: 2, nodeId: "node.s5", definitionId: "web.dom.extract_list", recordCount: 24 })
]): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: {
      schemaVersion: "0.1",
      runId: "run.1",
      flowId: "flow.1",
      projectId: "project.1",
      status: "failed",
      startedAt: 1_000,
      updatedAt: NOW,
      routeDecisionCount: 0,
      subflowEntryCount: 0,
      actionAttemptCount: attempts.length,
      interventionCount: 0,
      adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    actionAttempts: attempts,
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}

function step(fields: { order: number; nodeId: string; definitionId: string; recordCount?: number }): AutomationStudioFlowRunActionAttemptRecord {
  return {
    attemptId: `${fields.nodeId}.attempt.1`,
    nodeId: fields.nodeId,
    definitionId: fields.definitionId,
    order: fields.order,
    status: "succeeded",
    startedAt: 1_000 + fields.order,
    finishedAt: 1_100 + fields.order,
    metadata: fields.recordCount === undefined ? {} : { recordCount: fields.recordCount }
  };
}
