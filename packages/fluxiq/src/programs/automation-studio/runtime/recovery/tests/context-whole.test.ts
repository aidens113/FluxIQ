import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRouter, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { automationStudioResultFailureRecord, type AutomationStudioResultRepairDirective, type AutomationStudioResultVerificationOutcome } from "../../result-verification/index.ts";
import { AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS, buildAutomationStudioRuntimeRecoveryContext } from "../context.ts";
import { summarizeAutomationStudioRuntimeRecoveryContext } from "../context-summary.ts";
import { automationStudioRefutedResultAttempt } from "../refuted-result/index.ts";

// Live run `run-munnhi5q-4867dabe` (2026-09-29), stage 6. The Flow's answer was
// refuted as `core.result.does_not_answer_request` -- an extract_list read the
// whole unfiltered list a second time -- and the runtime diagnosis was handed
// `failure` and nothing else: every other section was dropped for a byte
// budget. There is no budget now (2026-09-30, "the model sees the whole page"),
// and these tests hold that every section arrives whole.
//
// The fixture is that run's shape: an 11-node bootstrap Flow with its real id
// scheme, eight actions, two extractions, a Subflow and a router, and a
// refutation whose judgement said what was wrong in full.

const HASH = "38f9de4a681ea8a6";
const node = (step: string) => `node.bootstrap.${HASH}.main.${step}`;
const FAILED = node("s11");
const DENIED = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"];

describe("a refuted result's recovery context, whole", () => {
  it("keeps the Flow graph with the failing node in it, and the failing step's parameters", () => {
    const { detail, trace } = refutedRun();
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: trace, flow: flow(), routers: [router()], deniedEvidenceKeys: DENIED, subflowId: "subflow.main" });

    const included = context.included.map((entry) => entry.section);
    expect(included).toEqual(expect.arrayContaining(["failure", "flow_graph", "step_parameters"]));

    const graph = context.sections.flow_graph as JsonObject;
    expect((graph.nodes as JsonObject[]).some((entry) => entry.nodeId === FAILED)).toBe(true);
    expect(graph.failingNode).toMatchObject({ nodeId: FAILED, incomingEdgeIds: [`edge.bootstrap.${HASH}.main.s10-s11`] });

    const steps = (context.sections.step_parameters as JsonObject).steps as JsonObject[];
    const failing = steps.filter((step) => step.nodeId === FAILED);
    expect(failing.some((step) => step.parameters !== undefined)).toBe(true);
    expect(JSON.stringify(failing)).toContain("maxPages");

    // Every edge between the shown nodes is there, so the second navigation and
    // extraction the judge said to remove can be named and rerouted.
    const edges = graph.edges as JsonObject[];
    expect(edges.some((edge) => edge.from === node("s9") && edge.to === node("s10"))).toBe(true);
    expect(edges.some((edge) => edge.from === node("s10") && edge.to === FAILED)).toBe(true);

    // The judge's directive reaches the repair whole, with the clauses that say
    // what to change.
    const failure = (context.sections.failure as JsonObject).failure as JsonObject;
    expect(failure).toMatchObject({ code: "core.result.does_not_answer_request", repair: { findings: expect.arrayContaining([expect.objectContaining({ code: "result.counts_look_right" })]) } });
    const advice = String(((failure.repair as JsonObject).judgement as JsonObject).advice);
    expect(advice.length).toBeGreaterThanOrEqual(200);
    expect(advice).toContain("rating at least 4.0, price under $50");
  });

  it("carries every section it built, untrimmed, and drops none for size", () => {
    const { detail, trace } = refutedRun();
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: trace, flow: flow(), routers: [router()], deniedEvidenceKeys: DENIED, subflowId: "subflow.main" });

    expect(context.included.map((entry) => entry.section)).toEqual(expect.arrayContaining(["failure", "flow_graph", "step_parameters", "subflow", "route_context", "recent_nodes"]));
    expect(context.omitted.every((entry) => entry.reason === "absent" || entry.reason === "withheld")).toBe(true);
    expect(JSON.stringify(context.sections)).not.toContain("trimmedToFit");
    expect(context.byteCount).toBe(Buffer.byteLength(JSON.stringify({ ...context, byteCount: 0 }), "utf8"));
    expect(context.included.length + context.omitted.length).toBe(AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS.length);
    // The neighbouring extraction's filter is shown beside the failing one:
    // there is no budget to trade it away for.
    const s9 = ((context.sections.step_parameters as JsonObject).steps as JsonObject[]).find((step) => step.nodeId === node("s9"))!;
    expect(JSON.stringify(s9.parameters)).toContain("notContains");
    const summary = summarizeAutomationStudioRuntimeRecoveryContext(context);
    expect(summary.included).toEqual(context.included);
  });

  it("carries the failure record's own expected and actual texts beside the directive", () => {
    const { detail, trace } = refutedRun();
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: trace, flow: flow(), routers: [router()], deniedEvidenceKeys: DENIED, subflowId: "subflow.main" });
    const failure = (context.sections.failure as JsonObject).failure as JsonObject;

    expect(failure.expected).toEqual(expect.any(String));
    expect(failure.actual).toEqual(expect.stringContaining("55 records stored"));
  });

  it("carries a large state diff, every list entry and every recovered failure whole", () => {
    const { detail, trace } = refutedRun();
    const failing = detail.actionAttempts!.find((attempt) => attempt.attemptId === trace.attemptId) ?? detail.actionAttempts![detail.actionAttempts!.length - 1]!;
    const stateDiff: JsonObject = {
      schemaVersion: "web-state-diff.v2",
      added: Array.from({ length: 300 }, (_, index) => ({ label: `Row ${index} ${"description ".repeat(40)}`, index })),
      note: "n".repeat(5_000)
    };
    failing.metadata = { ...(failing.metadata ?? {}), stateRefs: { stateDiff } };
    const context = buildAutomationStudioRuntimeRecoveryContext({ detail, failedAttempt: trace, flow: flow(), routers: [router()], deniedEvidenceKeys: DENIED, subflowId: "subflow.main" });

    expect(context.sections.state_diff).toEqual({ stateDiff });
    expect(context.byteCount).toBeGreaterThan(100_000);
  });
});

const JUDGED_EXPECTED = "Products from the Brightaisle search for wireless earbuds that are Plus eligible, rated 4.0 stars or higher, priced under $50, not sponsored, and not accessories such as ear tips or charging cases, as one list in search order with each product once.";
const JUDGED_OBSERVED = "Two overlapping record sets: the first is filtered on accessories only, the second is the whole unfiltered result list read again from the start, 55 rows with sponsored items, prices over $50 and ratings under 4.0, and neither applies the Plus, rating or price conditions.";
const JUDGED_ADVICE = "Add where-conditions to the extraction for Plus eligibility, rating at least 4.0, price under $50, not sponsored and not an accessory; dedupe once by url in search order; remove the second navigation and extraction so the answer is one record set rather than two overlapping ones.";

function directive(): AutomationStudioResultRepairDirective {
  return {
    schemaVersion: "automation-studio.result-repair-directive.v1",
    findings: [
      { code: "result.counts_look_right", detail: "No count is wrong on its own, so what is wrong is which rows, or which values, were kept." },
      { code: "result.summary_withheld", detail: "Part of the account this verdict was reached from was cut to fit, so the sample is narrower than the counts." }
    ],
    fix: [`Compare the request's own terms against the stored columns and the parameters of the steps that decided them -- the Flow's last step is ${FAILED} (web.dom.extract_list), and change the step whose parameters decide which rows are kept.`],
    judgement: { expected: JUDGED_EXPECTED, observed: JUDGED_OBSERVED, advice: JUDGED_ADVICE }
  };
}

function refutedRun(): { detail: AutomationStudioFlowRunDetail; trace: NonNullable<ReturnType<typeof automationStudioRefutedResultAttempt>>["trace"] } {
  const repair = directive();
  const observation = "55 records stored, across 2 record sets; the Flow's steps were builtin.control.start, web.browser.navigate, web.dom.click, web.dom.type, web.dom.click, web.dom.click, web.dom.extract_list, web.browser.navigate, and 2 more; part of the summary was withheld to fit the call.";
  const outcome = {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: true,
    verdict: "does_not_answer",
    basis: "model",
    code: "core.result.does_not_answer_request",
    reason: "The result was judged not to answer the request the Flow was built for, although every step of the run succeeded.",
    observation,
    repair,
    failure: automationStudioResultFailureRecord({ verdict: "does_not_answer", code: "core.result.does_not_answer_request", observation, repair })
  } as AutomationStudioResultVerificationOutcome;
  const detail = runDetail();
  const attempt = automationStudioRefutedResultAttempt({ runId: detail.summary.runId, detail, outcome, now: 200_000 })!;
  return { detail: { ...detail, actionAttempts: [...detail.actionAttempts!, attempt.record] }, trace: attempt.trace };
}

const STEPS: Array<{ step: string; definitionId: string; label: string; parameterValues: JsonObject; recordCount?: number }> = [
  { step: "s1", definitionId: "web.browser.navigate", label: "Open the Brightaisle store front page", parameterValues: { url: "http://127.0.0.1:41235/", newTab: false, timeoutMs: 30_000 } },
  { step: "s2", definitionId: "web.dom.click", label: "Accept the cookie banner so the page is usable", parameterValues: { element: { role: "button", name: "Accept" }, timeoutMs: 10_000 } },
  { step: "s4", definitionId: "web.dom.type", label: "Type the search terms into the store search box", parameterValues: { element: { role: "searchbox", name: "Search Brightaisle" }, text: "wireless earbuds", timeoutMs: 10_000 } },
  { step: "s6", definitionId: "web.dom.click", label: "Submit the search with the Go button", parameterValues: { element: { role: "button", name: "Go" }, timeoutMs: 10_000 } },
  { step: "s8", definitionId: "web.dom.click", label: "Dismiss the Continue shopping interstitial", parameterValues: { element: { role: "button", name: "Continue shopping" }, timeoutMs: 10_000 } },
  { step: "s9", definitionId: "web.dom.extract_list", label: "Read every earbud result across the pages, filtered", recordCount: 40, parameterValues: extraction(12, [{ read: "attribute:data-sponsored", is: "absent" }, { field: "name", notContains: ["ear tips", "charging case", "eartips"] }], true) },
  { step: "s10", definitionId: "web.browser.navigate", label: "Go back to the store front page", parameterValues: { url: "http://127.0.0.1:41235/", newTab: false, timeoutMs: 30_000 } },
  { step: "s11", definitionId: "web.dom.extract_list", label: "Read the whole result list again from the start", recordCount: 55, parameterValues: extraction(10, [{ read: "attribute:data-sponsored", is: "absent" }], false) }
];

function extraction(maxPages: number, where: JsonObject[], dedupe: boolean): JsonObject {
  return {
    extractList: {
      item: "[data-component-type=s-search-result]",
      fields: {
        name: { kind: "text", required: true, read: "text:h2" },
        price: { kind: "text", read: "text:.a-price" },
        rating: { kind: "text", read: "text:.a-icon-alt" },
        url: { kind: "link", required: true, read: "link:h2 a" }
      },
      where,
      paginate: { maxPages, next: "a.s-pagination-next" },
      ...(dedupe ? { dedupe: { by: ["url"] } } : {}),
      minItems: 1
    },
    ...(dedupe ? { recordOutput: { datasetId: "dataset.earbuds", columns: ["name", "price", "rating", "url"] } } : {}),
    timeoutMs: 60_000
  };
}

function flow(): AutomationStudioFlowDocument {
  const ids = ["start", ...STEPS.map((entry) => entry.step), "end"];
  return {
    schemaVersion: "0.1",
    flowId: "flow.brightaisle-earbuds",
    ownerKind: "policy",
    ownerId: "flow.brightaisle-earbuds",
    name: "Plus earbuds under $50",
    createdAt: 1,
    updatedAt: 2,
    nodes: [
      { id: node("start"), definitionId: "builtin.control.start" },
      ...STEPS.map((entry) => ({ id: node(entry.step), definitionId: entry.definitionId, label: entry.label, parameterValues: entry.parameterValues })),
      { id: node("end"), definitionId: "builtin.control.end" }
    ],
    edges: ids.slice(1).flatMap((to, index) => {
      const from = ids[index]!;
      const success = { id: `edge.bootstrap.${HASH}.main.${from}-${to}`, sourceNodeId: node(from), targetNodeId: node(to), sourcePortId: "success", targetPortId: "in" };
      return from === "start" || to === "end" ? [success] : [success, { id: `edge.bootstrap.${HASH}.main.${from}-failed`, sourceNodeId: node(from), targetNodeId: node("end"), sourcePortId: "failed", targetPortId: "in" }];
    })
  } as AutomationStudioFlowDocument;
}

function router(): AutomationStudioFlowRouter {
  return {
    schemaVersion: "0.1",
    routerId: `router.bootstrap.${HASH}`,
    flowId: "flow.brightaisle-earbuds",
    projectId: "project.lab",
    name: "Brightaisle entry router",
    status: "active",
    createdAt: 1,
    updatedAt: 2,
    fallback: { kind: "subflow", subflowId: "subflow.main" },
    rules: [
      { schemaVersion: "0.1", ruleId: `rule.bootstrap.${HASH}.main`, routerId: `router.bootstrap.${HASH}`, name: "Search results page for the request", target: { kind: "subflow", subflowId: "subflow.main" }, order: 1, status: "active", createdAt: 1, updatedAt: 2, condition: { signalPath: "page.url", operator: "contains", expected: "127.0.0.1:41235" } }
    ]
  } as AutomationStudioFlowRouter;
}

function runDetail(): AutomationStudioFlowRunDetail {
  const attempts: AutomationStudioFlowRunActionAttemptRecord[] = STEPS.map((entry, index) => ({
    attemptId: `attempt.${entry.step}`,
    nodeId: node(entry.step),
    definitionId: entry.definitionId,
    order: index + 1,
    status: "succeeded",
    route: "success",
    comparisonStatus: "matched",
    startedAt: 10_000 + index * 5_000,
    finishedAt: 12_000 + index * 5_000,
    durationMs: 2_000,
    ...(entry.recordCount !== undefined ? { metadata: { recordCount: entry.recordCount, outputShape: { records: { count: entry.recordCount }, pages: { count: 6 } } } } : {})
  } as AutomationStudioFlowRunActionAttemptRecord));
  return {
    schemaVersion: "0.1",
    summary: { runId: "run-munnhi5q-4867dabe", flowId: "flow.brightaisle-earbuds", projectId: "project.lab", status: "succeeded", startedAt: 9_000, updatedAt: 190_000 } as AutomationStudioFlowRunDetail["summary"],
    routeDecisions: [{ decisionId: "decision.1", routerId: `router.bootstrap.${HASH}`, selectedRuleId: `rule.bootstrap.${HASH}.main`, selectedSubflowId: "subflow.main", decidedAt: 9_500 }],
    subflows: [{ entryId: "entry.1", subflowId: "subflow.main", enteredAt: 9_500, exitedAt: 180_000, status: "succeeded" }],
    actionAttempts: attempts,
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  } as AutomationStudioFlowRunDetail;
}
