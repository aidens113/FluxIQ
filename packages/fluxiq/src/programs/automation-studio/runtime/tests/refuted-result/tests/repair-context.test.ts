// What the repair of a wrong answer is actually handed.
//
// Planning a repair is half the fix; the other half is that the model can see
// enough to make one. Five pieces are required of it -- what already ran, the
// conversation so far, the page as it was when the failure happened, the Flow
// itself with the node that failed in place, and the failure's own record --
// and this asserts each of them in the request `annotation/annotate.ts` builds
// for the patch call, assembled here exactly as that module assembles it.
//
// Two of the five were only partly there when this file was written, and are
// closed now: each step arrives with the parameters it ran with and what it
// produced, screened, and the Flow arrives as a graph -- nodes, edges, the
// router's rules, and the failing node located among them -- rather than as a
// flat step list. What is still not carried is stated as an assertion rather
// than left to be discovered: a step's *resolved* values are recorded nowhere
// in the system, so what is shown is the Flow's authored parameters.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type {
  AutomationStudioFlowDocument,
  AutomationStudioFlowRouter,
  AutomationStudioFlowRunActionAttemptRecord,
  AutomationStudioFlowRunDetail
} from "../../../../model/index.ts";
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
    // The packet's own action list is still nine identity fields and stays
    // that way: it is shared by every diagnosis call, and widening it would put
    // a projection of a page into paths designed not to carry one. The
    // parameters travel in the recovery context instead, where the screen is.
    expect(packet.recentActions?.every((action) => !("inputs" in action) && !("parameters" in action))).toBe(true);
  });

  // 1b. What each step ran with, and what it produced.
  it("carries each step's screened parameters and its own result", () => {
    const steps = (packet.recoveryContext?.sections.step_parameters as { steps: JsonObject[] } | undefined)?.steps ?? [];
    expect(steps.map((step) => step.nodeId)).toEqual(["node.s1", "node.s2", "node.s4", "node.s5", "node.s5"]);
    // A navigation says where it went, as an origin: the path and the query are
    // where a search term and a session token live.
    expect(steps[0]).toMatchObject({ definitionId: "web.browser.navigate", parameters: { url: "https://shop.example.com" } });
    // A click says which control, by the name a person would recognise, and
    // never by the selector beside it -- which is a key this domain denies.
    expect(steps[1]).toMatchObject({ parameters: { element: { accessibleName: "Sort by: Featured", role: "button" } } });
    expect(steps[1]?.parametersWithheld).toEqual(expect.arrayContaining(["selector", "target"]));
    // An extraction says which columns it asked the page for, and how many rows
    // it got. That is the pair the wrong-answer repair turns on. The column ids
    // are the field map's keys; their values are the page's own field names and
    // are not carried, so each key stands with a `null`.
    expect(steps[3]).toMatchObject({
      definitionId: "web.dom.extract_list",
      recordCount: 24,
      status: "succeeded",
      parameters: { extractList: { fields: { name: null, price: null, rating: null }, minItems: 0, paginate: false } },
      outputShape: { records: 24 }
    });
    // The refutation's own attempt sits last, naming the step whose output was
    // judged wrong and carrying the same parameters, because it is the same node.
    expect(steps[4]).toMatchObject({
      status: "failed",
      failureCode: "core.result.does_not_answer_request",
      parameters: { extractList: { fields: { name: null } } }
    });
    // What was screened out is named, never silently dropped: a parameter that
    // was withheld and a parameter the step never had must not read alike.
    expect(steps[3]?.parametersWithheld).toEqual(expect.arrayContaining(["extractList.handle", "apiKey"]));
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

  // 4b. The Flow as a graph rather than as a line.
  it("carries the Flow's edges and its router's rules, with the failing node in place in them", () => {
    const graph = packet.recoveryContext?.sections.flow_graph as {
      nodes: JsonObject[]; edges: JsonObject[]; routers: JsonObject[]; failingNode: JsonObject;
    } | undefined;
    expect(graph?.nodes.map((node) => node.nodeId)).toEqual(["node.s1", "node.s2", "node.s4", "node.s5"]);
    // The edges: the thing a flat step list cannot express, and the thing a
    // reroute is written in terms of.
    expect(graph?.edges).toEqual([
      { edgeId: "edge.1", from: "node.s1", to: "node.s2", fromPort: "success", toPort: "in" },
      { edgeId: "edge.2", from: "node.s2", to: "node.s4", fromPort: "success", toPort: "in" },
      { edgeId: "edge.3", from: "node.s2", to: "node.s4", fromPort: "failed", toPort: "in" },
      { edgeId: "edge.4", from: "node.s4", to: "node.s5", fromPort: "out", toPort: "in" }
    ]);
    // The router's rules, in order, each with the condition that selects it and
    // the Subflow it selects. A branch the model was never shown is a branch it
    // could not have repaired.
    expect(graph?.routers).toEqual([{
      routerId: "router.1",
      name: "Store router",
      status: "active",
      rules: [
        { ruleId: "rule.plus", name: "Plus members", order: 1, status: "active", target: { kind: "subflow", subflowId: "subflow.plus" }, condition: { signalPath: "page.url", operator: "contains", expected: "/plus" } },
        { ruleId: "rule.guest", name: "Everyone else", order: 2, status: "active", target: { kind: "subflow", subflowId: "subflow.guest" } }
      ],
      fallback: { kind: "subflow", subflowId: "subflow.guest" }
    }]);
    // Where the failure sits in that structure, not merely which node it was.
    expect(graph?.failingNode).toEqual({ nodeId: "node.s5", incomingEdgeIds: ["edge.4"] });
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
    expect(refusal(packet)).toBeUndefined();
  });

  // The screen is only worth having if the pre-send check would catch it
  // failing. The recovery context was not checked there at all until it began
  // carrying a projection of the Flow's parameters and a domain's output port
  // ids; each of the three ways it could now leak is poisoned in turn, through
  // the real check rather than around it.
  it("is refused before it is sent if anything unscreened reaches the recovery context", () => {
    for (const poison of [
      { section: "step_parameters", value: { steps: [{ nodeId: "node.s5", parameters: { html: "<table>…</table>" } }] } },
      { section: "step_parameters", value: { steps: [{ nodeId: "node.s5", parameters: { note: "bearer sk-live-4f8a2b9c1d7e3a5f6b0c" } }] } },
      { section: "flow_graph", value: { nodes: [{ nodeId: "node.s5", label: "button[data-testid=\"pay\"]" }] } }
    ]) {
      const poisoned = {
        ...packet,
        recoveryContext: {
          ...packet.recoveryContext!,
          sections: { ...packet.recoveryContext!.sections, [poison.section]: poison.value }
        }
      };
      expect(refusal(poisoned as typeof packet)).toBe("llm.provider_recovery_context_invalid");
    }
  });

  // What the screen leaves behind, asserted by its absence in the whole request
  // rather than in the field it was put in: the next leak arrives somewhere
  // else. These are the four things the fixture's Flow authored.
  it("carries none of the page, the person's text, the selector or the handle anywhere in the request", () => {
    const serialized = JSON.stringify(packet);
    for (const secret of ["#plus-filter", "Aiden Stapler", "listings-abc123", "productTitle", "sk-live-9f2c7a1b3d5e8f0a4c6b", "/search?q=plus+items&session=9f2c"]) {
      expect(serialized, secret).not.toContain(secret);
    }
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

/** The provider's own pre-send check, run on the request as it would be sent. */
function refusal(context: ReturnType<typeof patchRequestPacket>) {
  return automationStudioLlmRequestEvidenceRefusal({
    taskKind: "runtime_patch",
    context,
    deniedEvidenceKeys: [...DENIED]
  } as unknown as Parameters<typeof automationStudioLlmRequestEvidenceRefusal>[0]);
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
    recoveryContext: buildAutomationStudioRuntimeRecoveryContext({
      detail,
      failedAttempt: attempt.trace,
      flow: flowDocument(),
      routers: [router()],
      deniedEvidenceKeys: [...DENIED]
    }),
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

/**
 * The Flow as authored, with the parameters the run's steps ran with.
 *
 * Everything a repair must be able to see is here, and so is everything it must
 * not: a raw selector, a search query with a session in it, the person's own
 * words in a typed field, an opaque extraction handle, and an API key somebody
 * pasted into a parameter.
 */
function flowDocument(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.1",
    ownerKind: "policy",
    ownerId: "flow.1",
    name: "Store listings",
    createdAt: 1,
    updatedAt: 2,
    nodes: [
      {
        id: "node.s1",
        definitionId: "web.browser.navigate",
        parameterValues: { url: "https://shop.example.com/search?q=plus+items&session=9f2c", newTab: false }
      },
      {
        id: "node.s2",
        definitionId: "web.dom.click",
        parameterValues: {
          selector: "#plus-filter",
          target: "target.7",
          element: { accessibleName: "Sort by: Featured", role: "button", text: "Aiden Stapler" },
          timeoutMs: 10_000
        }
      },
      { id: "node.s4", definitionId: "builtin.control.merge" },
      {
        id: "node.s5",
        definitionId: "web.dom.extract_list",
        parameterValues: {
          extractList: {
            handle: "listings-abc123",
            fields: { name: "productTitle", price: "priceText", rating: "ratingText" },
            minItems: 0,
            paginate: false
          },
          apiKey: "sk-live-9f2c7a1b3d5e8f0a4c6b",
          timeoutMs: 15_000
        }
      }
    ],
    edges: [
      { id: "edge.1", sourceNodeId: "node.s1", targetNodeId: "node.s2", sourcePortId: "success", targetPortId: "in" },
      { id: "edge.2", sourceNodeId: "node.s2", targetNodeId: "node.s4", sourcePortId: "success", targetPortId: "in" },
      { id: "edge.3", sourceNodeId: "node.s2", targetNodeId: "node.s4", sourcePortId: "failed", targetPortId: "in" },
      { id: "edge.4", sourceNodeId: "node.s4", targetNodeId: "node.s5", sourcePortId: "out", targetPortId: "in" }
    ]
  };
}

/** The branch the flat step list could not express. */
function router(): AutomationStudioFlowRouter {
  return {
    schemaVersion: "0.1",
    routerId: "router.1",
    flowId: "flow.1",
    projectId: "project.1",
    name: "Store router",
    status: "active",
    createdAt: 1,
    updatedAt: 2,
    fallback: { kind: "subflow", subflowId: "subflow.guest" },
    rules: [
      {
        schemaVersion: "0.1", ruleId: "rule.guest", routerId: "router.1", name: "Everyone else",
        target: { kind: "subflow", subflowId: "subflow.guest" }, order: 2, status: "active", createdAt: 1, updatedAt: 2
      },
      {
        schemaVersion: "0.1", ruleId: "rule.plus", routerId: "router.1", name: "Plus members",
        target: { kind: "subflow", subflowId: "subflow.plus" }, order: 1, status: "active", createdAt: 1, updatedAt: 2,
        condition: { signalPath: "page.url", operator: "contains", expected: "/plus" }
      }
    ]
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
    { attemptId: "a.4", nodeId: "node.s5", definitionId: "web.dom.extract_list", order: 4, status: "succeeded", startedAt: 1_400, finishedAt: 2_800, metadata: { recordCount: 24, outputShape: { records: 24 } } }
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
