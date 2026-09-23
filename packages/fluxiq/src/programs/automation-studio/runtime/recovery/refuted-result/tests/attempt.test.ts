// Cause 2 of the `ten-sites-r5` post-mortem: a Flow that runs cleanly and
// answers wrongly is never repaired, because the repair ladder is keyed on a
// failed attempt and a clean run has none. Both runs of that campaign made
// **zero** repair calls -- all 38 provider calls were 34 build plus 4
// verification -- while Core's own verification had recorded "does not answer"
// twice. These are the assertions that the verdict now becomes an attempt.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import type { AutomationStudioResultVerificationOutcome } from "../../../result-verification/index.ts";
import { automationStudioRefutedResultAttempt } from "../attempt.ts";

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
