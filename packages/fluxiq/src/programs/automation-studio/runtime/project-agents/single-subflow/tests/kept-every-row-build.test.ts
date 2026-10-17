// End to end (t692): a single-path build whose last read keeps every row it saw
// after an act over a narrower read of the same list. A8 cost round 2
// `run-mvbr0w7e-6a01c05b`: the builder's one test was the judged whole run, both
// judge calls said yes over an answer holding four rows the request did not ask
// for, and the Flow was promoted. Here, through the supervisor's loop on a
// scripted provider, the builder's real gate and the single-subflow test's
// port (`./gated-single-build.ts`), each whole trial is judged by the real
// build-test judge over a run summary Core makes, shaped like that run on a
// shop's returns desk: a read keeps the 3 returns of 7 at most 50, a press
// approves each of them, and a last read with no condition stores all 7.
// Core flags that read (`keptEveryRow`), the judge is shown the flag, its
// second call asks the converse question (t691), and the builder's gate takes
// the yes only where the converse confirmed it (t692). A yes that never says
// why the answer holds the four returns that were not approved is not taken,
// whether or not the record set says its passes (every row of a flagged read is
// a kept row Core flagged, `result-verification/request-rows/unquoted-rows.ts`);
// where the request asks for every return, a yes that says so of each passes. No model
// is called, and no realistic Lab scenario's task, site or answer is used.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowInstruction, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, summarizeAutomationStudioRunResult, type AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialFeedback } from "../../../service/candidate-trial/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { planInput, subflow, taskSpecInput } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, brief, call, dispatch, lastOf, supervise, type Step } from "../../supervisor/tests/supervisor-script.ts";
import { gatedSingleBuild } from "./gated-single-build.ts";

const ONE_PART = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const completeOnDispatch: Step = (evidence) => ({ kind: "complete", result: (lastOf(evidence, IDS.dispatch)?.complete as JsonObject | undefined) ?? { ended: "partial", reason: "No test answered yes." } });
const SCRIPT = ["flow: find newest", "step: read the titles", "  node: web.output.read-list", `  readList: ${JSON.stringify({ fields: { title: "title" } })}`];

const NS = "node.bootstrap.r1.returns";
const NARROW = `${NS}.s3`;
const EACH = `${NS}.s4`;
const APPROVE = `${NS}.s5`;
const LAST = `${NS}.s7`;

/** The desk's seven pending returns; those at most 50 are approved. */
const RETURNS = [["R-101 Lamp", 40], ["R-102 Blender", 60], ["R-103 Mug", 12], ["R-104 Kettle", 75], ["R-105 Toaster", 55], ["R-106 Scarf", 25], ["R-107 Mixer", 90]] as const;
const APPROVED = RETURNS.filter(([, amount]) => amount <= 50);
const NOT_APPROVED = RETURNS.filter(([, amount]) => amount > 50);

const flowNodes: AutomationStudioFlowNode[] = [
  { id: NARROW, definitionId: "unit.list", label: "read the pending returns of at most 50", parameterValues: { list: { item: "returns", fields: { title: { kind: "text" }, amount: { kind: "text" } }, where: [{ field: "amount", atMost: 50 }] } } },
  { id: EACH, definitionId: "builtin.control.for-each", label: "each return" },
  { id: APPROVE, definitionId: "unit.press", label: "approve the return", parameterValues: { element: { tagName: "button", accessibleName: "Approve" } }, metadata: { declaredConsequences: ["modify_existing"] } },
  { id: LAST, definitionId: "unit.list", label: "list the returns", parameterValues: { list: { item: "returns", fields: { title: { kind: "text" }, status: { kind: "text" } } } } }
];
const flowEdges: AutomationStudioFlowEdge[] = [
  { id: "e1", sourceNodeId: NARROW, sourcePortId: "records", targetNodeId: EACH, targetPortId: "items" },
  { id: "e2", sourceNodeId: EACH, sourcePortId: "body", targetNodeId: APPROVE },
  { id: "e3", sourceNodeId: APPROVE, targetNodeId: EACH },
  { id: "e4", sourceNodeId: EACH, sourcePortId: "done", targetNodeId: LAST }
];

let order = 0;
const attempt = (nodeId: string, definitionId: string, extra: Partial<AutomationStudioFlowRunActionAttemptRecord> = {}): AutomationStudioFlowRunActionAttemptRecord => {
  order += 1;
  return { attemptId: `a.${order}`, nodeId, definitionId, order, status: "succeeded", startedAt: order, ...extra };
};

/** The run as its record holds it: the narrower read, a press per kept row, the last read. */
function attempts(): AutomationStudioFlowRunActionAttemptRecord[] {
  const aloneRows = NOT_APPROVED.map(([title, amount]) => ({ title, amount: `$${amount}.00` }));
  return [
    attempt(NARROW, "unit.list", { metadata: { extraction: { recordCount: APPROVED.length, pagesRead: 1, truncated: false, itemsSeen: RETURNS.length,
      conditions: { applied: RETURNS.length, kept: APPROVED.length, unfiltered: false, rejected: [NOT_APPROVED.length], alone: [NOT_APPROVED.length], aloneRows: [aloneRows] } } } }),
    ...APPROVED.flatMap(() => [attempt(EACH, "builtin.control.for-each", { route: "body" }), attempt(APPROVE, "unit.press")]),
    attempt(EACH, "builtin.control.for-each", { route: "done" }),
    attempt(LAST, "unit.list", { metadata: { extraction: { recordCount: RETURNS.length, pagesRead: 1, truncated: false, itemsSeen: RETURNS.length } } })
  ];
}

/** The trial's summary; `passes`, whether the record set says the read that collected it, as a real set does. */
function summary(passes = true): AutomationStudioRunResultSummary {
  return summarizeAutomationStudioRunResult({
    recordSets: [{
      summary: { runId: "trial.1", datasetId: "returns", nodeIds: [LAST], schemaDigest: "digest", recordCount: RETURNS.length, truncated: false, invalidCount: 0, updatedAt: 1,
        ...(passes ? { processing: { collected: RETURNS.length, duplicates: 0, filteredOut: 0, cut: 0, kept: RETURNS.length, passes: [{ node: LAST, pass: 1, rows: RETURNS.length, newRows: RETURNS.length }] } } : {}) },
      schema: { schemaVersion: "0.1", fields: ["title", "status"].map((id) => ({ id, label: id, valueType: "string" as const })) },
      rows: RETURNS.map(([title, amount]) => ({ title, status: amount <= 50 ? "Approved" : "Pending" }))
    }],
    flowNodes, flowEdges, actionAttempts: attempts(), deniedEvidenceKeys: [], now: 0
  });
}

function instruction(body: string): AutomationStudioFlowInstruction {
  return { schemaVersion: "0.1", instructionId: "instruction.build", title: "Returns", scope: { kind: "flow", projectId: "project", flowId: "parent" }, body, priority: 100, status: "active", requirement: "required", createdAt: 0, updatedAt: 0 };
}

/** The supervisor's loop over a build whose every whole trial answers what `judged` gives. */
async function supervised(judged: NonNullable<Parameters<typeof gatedSingleBuild>[0]["judged"]>) {
  const built = gatedSingleBuild({ scripts: [SCRIPT], judged });
  const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);
  return { run, built };
}

/** A build whose every whole trial is judged by the real judge, its every call answering yes with `observed`, over the summary above. */
async function build(request: string, observed: string, passes = true) {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const provider = mockProvider(async (asked) => {
    seen.push(structuredClone(asked));
    return judgeReply("yes", { observed });
  });
  const judge = automationStudioBuildTestJudge({ provider, instructions: [instruction(request)], deniedEvidenceKeys: [], projectId: "project", flowId: "parent" });
  const { run, built } = await supervised(async (number) => {
    const judgedSummary = summary(passes);
    const verdict = await judge({ summary: judgedSummary });
    return automationStudioCandidateTrialFeedback.judged({ verdict, summary: judgedSummary, trialRunId: `trial.${number}`, start: "reset" });
  });
  return { run, built, seen };
}

const READ_LAST = (said: unknown) => (said as { context: { resultSummary?: { reads?: Array<{ nodeId: string; keptEveryRow?: JsonObject }> } } }).context.resultSummary?.reads?.find((read) => read.nodeId === LAST)?.keptEveryRow;

describe("a single-path build whose last read keeps every row after an act over a narrower read (t692)", () => {
  it("shows the judge Core's flag on that read, and does not take a yes that never says why the answer holds the rows the act passed over", async () => {
    const { run, built, seen } = await build(
      "Approve every pending return of at most 50, then list the returns the desk now shows as approved.",
      "Condition 1 (amount atMost 50) keeps the returns \"of at most 50\", each was approved, and the table lists the returns."
    );
    expect(seen.length).toBeGreaterThan(0);
    for (const asked of seen) expect(READ_LAST(asked)).toMatchObject({ narrowerRead: NARROW, narrowerSeen: 7, narrowerKept: 3, actedBy: [APPROVE] });
    // The confirming call asked the converse question, each stored row against the request's words (t691).
    expect(JSON.stringify(seen.map((asked) => asked.context))).toContain("asking the converse question");
    expect(built.tested).toHaveLength(1);
    // The yes is held for the rows it never accounted for (t691), and the builder's gate does not take it.
    expect(built.tested[0]!.resultCode).toBe("subflow.trial_not_judged");
    expect(built.tested[0]!.evidence).toMatchObject({ verdict: "not_judged", feedback: { yesUnconfirmed: true } });
    const { gate, accepted } = built.gates[0]!;
    expect(gate.completion(accepted[0]!)).toMatchObject({ ok: false });
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).not.toBe("candidate");
  });

  it("passes where the request asks for every return and the yes says so of each row the last read stored, its converse confirming it", async () => {
    const every = RETURNS.map(([title]) => title).join(", ");
    const { run, built, seen } = await build(
      "Approve every pending return of at most 50, then list every return on the desk with its status.",
      `Condition 1 (amount atMost 50) keeps the returns "of at most 50" for approval, and each was approved. Read ${LAST} stored ${every}, approved or still pending, because the request asks to "list every return on the desk with its status".`
    );
    expect(seen.length).toBe(2);
    expect(built.tested.map((answer) => answer.resultCode)).toEqual(["subflow.trial_yes"]);
    const evidence = built.tested[0]!.evidence as JsonObject;
    expect(evidence.feedback).toMatchObject({ keptEveryRow: [{ read: LAST }], rowCheck: expect.stringContaining("the yes stands") });
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
  });

  it("does not take a yes over the flagged read that the converse question did not confirm, and tells the builder why", async () => {
    const judgedSummary = summary();
    const flag = judgedSummary.reads!.find((read) => read.nodeId === LAST)!.keptEveryRow!;
    const told = automationStudioCandidateTrialFeedback.judged({ verdict: { verdict: "yes", spent: { calls: 2, inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 }, firstAskConfirmed: false }, summary: judgedSummary, trialRunId: "trial.1", start: "reset" });
    expect(told.feedback).toMatchObject({ firstAskConfirmed: false, reads: expect.arrayContaining([expect.objectContaining({ nodeId: LAST, kept: 7, keptEveryRow: flag })]) });
    const { run, built } = await supervised(async () => told);
    expect(built.tested.map((answer) => answer.resultCode)).toEqual(["subflow.trial_unsure"]);
    expect(built.tested[0]!.evidence).toMatchObject({ verdict: "unsure", feedback: { code: "subflow.trial_rows_unaccounted", keptEveryRow: [{ read: LAST, said: flag.said }] } });
    expect(String((built.tested[0]!.evidence as JsonObject).instruction)).toContain("Read keptEveryRow");
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).not.toBe("candidate");
  });

  it("does not take a converse-confirmed yes that lists the returns only beside the bound's quote, where the record set says no passes", async () => {
    const titles = RETURNS.map(([title]) => title).join(", ");
    const { run, built, seen } = await build(
      "Approve every pending return of at most 50, then list the returns the desk now shows as approved.",
      `Condition 1 (amount atMost 50) kept and left out the returns ${titles} -- all as the request's "of at most 50" asks. The table holds all 7 rows.`,
      false
    );
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(built.tested[0]!.evidence).toMatchObject({ verdict: "not_judged", feedback: { yesUnconfirmed: true } });
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).not.toBe("candidate");
  });
});
