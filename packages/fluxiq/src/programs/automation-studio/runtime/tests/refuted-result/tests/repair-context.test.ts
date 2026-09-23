// What the repair of a wrong answer is actually handed.
//
// Planning a repair is half the fix; the other half is that the model can see
// enough to make one. Five pieces are required of it -- what already ran, the
// conversation so far, the page as it was when the failure happened, the Flow
// itself with the node that failed in place, and the failure's own record --
// and this asserts each of them in the request `annotation/annotate.ts` builds
// for the patch call, assembled here exactly as that module assembles it.
//
// Two of the five are only partly there and the assertions say so rather than
// passing on a half-truth: the steps arrive as identity, order, status and row
// count, never the parameters they ran with (the persisted run record has never
// carried `inputs`), and the Flow arrives as its authored step list and its
// route decisions, not as its edges or its router's rules.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { automationStudioLlmRequestEvidenceRefusal, packAutomationStudioLlmContext, type AutomationStudioLlmHarnessInput } from "../../../llm/index.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../../../recovery/index.ts";
import { automationStudioRefutedResultAttempt, repairAutomationStudioRefutedRunResult } from "../../../recovery/refuted-result/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";

const NOW = 5_000;
const DENIED = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;

describe("a refuted result entering the failure entry point", () => {
  it("is handed to the recovery automatically, and never merely filed", async () => {
    const handed: Parameters<Parameters<typeof repairAutomationStudioRefutedRunResult>[0]["repair"]>[0][] = [];
    const saved: AutomationStudioFlowRunDetail[] = [];

    const result = await repairAutomationStudioRefutedRunResult({
      runId: "run.1",
      detail: cleanRun(),
      outcome: refuted(),
      summary: resultSummary(),
      now: NOW,
      repair: async (request) => { handed.push(request); return undefined; },
      saveFlowRunDetail: async (detail) => { saved.push(detail); }
    });

    expect(handed).toHaveLength(1);
    expect(handed[0]?.failedTraceAttempt.nodeId).toBe("node.s5");
    // The run the recovery reads carries the refutation as a failed attempt, so
    // the ladder's own `find(status === "failed")` sees it.
    expect(handed[0]?.detail.summary.status).toBe("failed");
    expect(handed[0]?.detail.actionAttempts?.at(-1)).toMatchObject({ status: "failed", nodeId: "node.s5", failure: { stage: "verification" } });
    // Saved whether or not the recovery produced anything: the run has to say
    // which step's output was wrong even when no provider was available.
    expect(saved).toHaveLength(1);
    expect(result?.actionAttempts).toHaveLength(5);
  });

  // Verifying a repaired run's own result closes a circle: verify, repair,
  // retry, verify. The entry point is taken once per run, and the run says so,
  // so a second refutation is recorded and not repaired again.
  it("is entered once per run, whatever the re-run's result is judged to be", async () => {
    const first = await repairAutomationStudioRefutedRunResult({
      runId: "run.1", detail: cleanRun(), outcome: refuted(), summary: resultSummary(), now: NOW,
      repair: async () => undefined, saveFlowRunDetail: async () => undefined
    });

    expect(first?.metadata?.resultRepair).toMatchObject({ attempted: true, nodeId: "node.s5" });
    expect(await repairAutomationStudioRefutedRunResult({
      runId: "run.1",
      // What the adaptive retry saves: a run detail rebuilt from the retried
      // session's trace, with the pre-retry metadata carried forward.
      detail: { ...cleanRun(), metadata: first?.metadata ?? {} },
      outcome: refuted(), summary: resultSummary(), now: NOW + 1_000,
      repair: async () => { throw new Error("The failure entry point must not be taken twice for one run."); },
      saveFlowRunDetail: async () => { throw new Error("A second pass must save nothing."); }
    })).toBeUndefined();
  });

  it("does nothing, and saves nothing, for a result that answers", async () => {
    const saved: AutomationStudioFlowRunDetail[] = [];
    const result = await repairAutomationStudioRefutedRunResult({
      runId: "run.1",
      detail: cleanRun(),
      outcome: answered(),
      summary: resultSummary(),
      now: NOW,
      repair: async () => { throw new Error("The recovery must not be entered for a result that answers."); },
      saveFlowRunDetail: async (detail) => { saved.push(detail); }
    });

    expect(result).toBeUndefined();
    expect(saved).toEqual([]);
  });
});

describe("the request a wrong answer is repaired from", () => {
  const packet = patchRequestPacket();

  // 1. What already ran.
  it("carries the steps that ran, in order, with what each produced", () => {
    expect(packet.recentActions?.map((action) => [action.nodeId, action.status])).toEqual([
      ["node.s1", "succeeded"],
      ["node.s2", "succeeded"],
      ["node.s4", "succeeded"],
      ["node.s5", "succeeded"],
      ["node.s5", "failed"]
    ]);
    expect(packet.recoveryContext?.sections.recent_nodes).toMatchObject({ succeeded: expect.arrayContaining([{ nodeId: "node.s1", definitionId: "web.browser.navigate", order: 1 }]) });
    // What they produced: rows stored, rows refused, and the columns they
    // carry. Before this the repair saw the failure and never the answer.
    expect(packet.resultSummary).toMatchObject({ totalRecordCount: 24, recordSetCount: 1 });
    expect(packet.resultSummary?.recordSets[0]?.columns).toEqual(["name", "price", "rating", "url"]);
    // Stated rather than assumed: the parameters each step ran with are not
    // here, because the persisted run record does not carry an attempt's
    // `inputs` at all. See the report for what that costs.
    expect(packet.recentActions?.every((action) => !("inputs" in action))).toBe(true);
  });

  // 2. The conversation so far.
  it("carries the conversation, in reading order, with what was left out counted", () => {
    expect(packet.conversation?.turns).toEqual([
      { ordinal: 1, author: "person", text: "Get me every Plus item under $50 rated 4 or better." },
      { ordinal: 2, author: "automation", text: "Understood. I will search the store and collect the matching products." },
      { ordinal: 3, author: "person", text: "Only the Plus ones. The last table had everything in it." }
    ]);
    expect(packet.conversation?.withheldTurns).toBe(0);
  });

  // 3. The page as it was when the failure happened.
  it("carries the page the run finished on", () => {
    expect(packet.failureEvidence).toMatchObject({ schemaVersion: "web-llm-evidence.v2", resultsHeading: "1-16 of over 1,000 results" });
  });

  // 4. The Flow itself, and the node that failed in place.
  it("carries the Flow's steps in authored order, its routing, and the node the wrong answer came out of", () => {
    expect(packet.resultSummary?.flowShape.map((step) => step.definitionId)).toEqual([
      "web.browser.navigate", "web.dom.click", "builtin.control.merge", "web.dom.extract_list"
    ]);
    expect(packet.recoveryContext?.sections.route_context).toMatchObject({ decisions: [{ routerId: "router.1", fallbackUsed: true }] });
    expect(packet.nodeId).toBe("node.s5");
    expect(packet.recoveryContext?.sections.failure).toMatchObject({ nodeId: "node.s5", definitionId: "web.dom.extract_list" });
  });

  // 5. The failure's own record.
  it("carries what was expected and what was observed instead", () => {
    expect(packet.recoveryContext?.sections.failure).toMatchObject({
      failure: {
        category: "output_not_observed",
        code: "core.result.does_not_answer_request",
        stage: "verification",
        expected: "A result that answers the request the Flow was built for.",
        actual: "24 records stored, across 1 record set."
      }
    });
  });

  // The slot and the pre-send check are two lists of task kinds, and they were
  // not the same list: the builder put the summary on a runtime patch and the
  // provider's own check refused it, so widening one without the other would
  // have stopped every repair call before it left the process.
  it("passes the provider's pre-send evidence check, summary and all", () => {
    expect(automationStudioLlmRequestEvidenceRefusal({
      taskKind: "runtime_patch",
      context: packet,
      deniedEvidenceKeys: [...DENIED]
    } as unknown as Parameters<typeof automationStudioLlmRequestEvidenceRefusal>[0])).toBeUndefined();
  });

  it("carries none of it into a call that is not repairing a finished run", () => {
    const { failureEvidence: _page, recoveryContext: _recovery, ...rest } = harnessInput();
    const bootstrap = packAutomationStudioLlmContext({ ...rest, taskKind: "flow_bootstrap" });

    expect(bootstrap.resultSummary).toBeUndefined();
    expect(bootstrap.conversation).toBeUndefined();
    expect(bootstrap.recoveryContext).toBeUndefined();
  });
});

/** The packet `annotate.ts` builds for the patch call, assembled the same way. */
function patchRequestPacket() {
  return packAutomationStudioLlmContext(harnessInput());
}

function harnessInput(): AutomationStudioLlmHarnessInput {
  const attempt = automationStudioRefutedResultAttempt({ runId: "run.1", detail: cleanRun(), outcome: refuted(), now: NOW });
  if (!attempt) throw new Error("A refuted result must produce an attempt for this test to mean anything.");
  const detail: AutomationStudioFlowRunDetail = { ...cleanRun(), actionAttempts: [...(cleanRun().actionAttempts ?? []), attempt.record] };
  return {
    taskKind: "runtime_patch",
    stage: "implement",
    projectId: "project.1",
    flowId: "flow.1",
    runId: "run.1",
    nodeId: attempt.trace.nodeId,
    instructions: [],
    runDetail: detail,
    deniedEvidenceKeys: [...DENIED],
    failureEvidence: { schemaVersion: "web-llm-evidence.v2", resultsHeading: "1-16 of over 1,000 results", plusFilterChecked: false },
    recoveryContext: buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: attempt.trace }),
    resultSummary: resultSummary(),
    conversation: [
      { turnId: "t1", conversationId: "c1", ordinal: 1, author: "person", createdAt: 1, text: "Get me every Plus item under $50 rated 4 or better.", actorId: "user.1", ask: null, attachment: null },
      { turnId: "t2", conversationId: "c1", ordinal: 2, author: "automation", createdAt: 2, text: "Understood. I will search the store and collect the matching products.", actorId: null, ask: null, attachment: null },
      { turnId: "t3", conversationId: "c1", ordinal: 3, author: "person", createdAt: 3, text: "Only the Plus ones. The last table had everything in it.", actorId: "user.1", ask: null, attachment: null }
    ]
  };
}

function resultSummary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 24,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "dataset.1",
      recordCount: 24,
      refusedCount: 0,
      truncated: false,
      columns: ["name", "price", "rating", "url"],
      columnsWithheld: false,
      rowsChecked: 24,
      rowsMissingRequired: 0,
      missingRequiredColumns: []
    }],
    flowShape: [
      { nodeId: "node.s1", definitionId: "web.browser.navigate" },
      { nodeId: "node.s2", definitionId: "web.dom.click" },
      { nodeId: "node.s4", definitionId: "builtin.control.merge" },
      { nodeId: "node.s5", definitionId: "web.dom.extract_list" }
    ],
    withheld: false
  };
}

/** The same verification, having judged that the result does answer. */
function answered(): AutomationStudioResultVerificationOutcome {
  const { failure: _none, ...rest } = refuted() as Extract<AutomationStudioResultVerificationOutcome, { performed: true }>;
  return { ...rest, verdict: "answers", code: "core.result.answers_request", verdicts: ["answers"], calls: 1 };
}

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

/** `run-mudw1ktb`: five attempts, every one succeeded, and the answer wrong. */
function cleanRun(): AutomationStudioFlowRunDetail {
  const attempts: AutomationStudioFlowRunActionAttemptRecord[] = [
    { attemptId: "a.1", nodeId: "node.s1", definitionId: "web.browser.navigate", order: 1, status: "succeeded", startedAt: 1_000, finishedAt: 1_100 },
    { attemptId: "a.2", nodeId: "node.s2", definitionId: "web.dom.click", order: 2, status: "succeeded", startedAt: 1_200, finishedAt: 1_240 },
    { attemptId: "a.3", nodeId: "node.s4", definitionId: "builtin.control.merge", order: 3, status: "succeeded", startedAt: 1_300, finishedAt: 1_310 },
    { attemptId: "a.4", nodeId: "node.s5", definitionId: "web.dom.extract_list", order: 4, status: "succeeded", startedAt: 1_400, finishedAt: 2_800, metadata: { recordCount: 24 } }
  ];
  return {
    schemaVersion: "0.1",
    summary: {
      schemaVersion: "0.1", runId: "run.1", flowId: "flow.1", projectId: "project.1", status: "failed",
      startedAt: 1_000, updatedAt: NOW, routeDecisionCount: 1, subflowEntryCount: 0,
      actionAttemptCount: attempts.length, interventionCount: 0, adaptationCount: 0
    },
    routeDecisions: [{ decisionId: "decision.1", routerId: "router.1", fallbackUsed: true, decidedAt: 1_000 }],
    subflows: [],
    actionAttempts: attempts,
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
