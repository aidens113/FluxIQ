// A subflow trial's entry is setup, not the subflow's work (t599).
//
// A8 social `run-mv8ic6mk-09bf12ff`: a trial of a read-only subflow ran its
// predecessor inside it, as every subflow trial does. Its judges were held to
// quote, beside the predecessor's left-out rows, words their request -- the
// subflow's own parts -- does not hold (`not_judged` three times), and t594's
// out-of-scope rule had them answer no to the predecessor's presses Core
// itself put in the trial. Here, through the real port, the judge is told
// which steps prepared the entry and that they are not this subflow's; and,
// over a summary shaped like that trial's on another kind of site, a yes that
// accounts for the subflow's own rows stands although the predecessor's read
// left out a row it never names. No model is called.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler } from "../../../project-agents/host-resources/index.ts";
import { StubHost } from "../../../project-agents/host-resources/tests/stub-host.ts";
import type { AutomationStudioProjectBuildRecordStore } from "../../../project-agents/index.ts";
import { automationStudioBuildTestJudge, summarizeAutomationStudioRunResult } from "../../../result-verification/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { subflowTrialFixture } from "../../subflow-trial/tests/fixtures.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import { automationStudioProjectBuildSubflowTrials } from "../subflow-trials.ts";
import { AutomationStudioProjectBuildTaskChecklist } from "../task-checklist.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";

const REF = { projectId: "project", flowId: "parent", buildId: "build.1" };
const binding = { domainId: "test", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {} }) } as unknown as AutomationStudioLlmEvidenceRuntimeBinding;

/** The build record as a subflow trial reads it: the plan in force and its task spec, whose other part is the predecessor's. */
const records = { read: async () => ({
  record: {
    plans: [{ plan: { digest: "plan.1", taskSpecDigest: "spec.1" } }],
    taskSpecs: [{ taskSpec: { digest: "spec.1", notAsked: [], parts: [
      { id: "part.0", quote: { sourceId: "instruction", text: "find the entry and mark it" }, goalFacts: [], lastingActs: ["modify_existing"] },
      { id: "part.1", quote: { sourceId: "instruction", text: "carry out its part" }, goalFacts: [], lastingActs: [] }
    ] } }]
  }
}) } as unknown as Pick<AutomationStudioProjectBuildRecordStore, "read">;

function scopeOf(subflowKey: string, briefId: string, predecessors: string[], partId = "part.1"): AutomationStudioSubflowScope {
  return { buildId: "build.1", briefId, planDigest: "plan.1", subflowKey, predecessors, parts: [{ partId, sourceId: "instruction", text: "carry out its part" }], interface: { inputs: [], outputs: [] } };
}

const sectionOf = (request: AutomationStudioLlmTaskRequest) => (request.context.resultSummary as unknown as { taskChecklist: { supplementary: string; entry?: { subflows: string[]; steps: string[] } } }).taskChecklist;

/** One partial trial of `add` through the project build's port, its predecessor `find` (a press) run first where named. */
async function trialOfAdd(predecessors: string[]): Promise<AutomationStudioLlmTaskRequest[]> {
  const f = subflowTrialFixture();
  const { judge: _judge, predecessorProposals: _predecessors, ...environment } = f.ports;
  const proposals = new AutomationStudioProjectBuildProposals();
  proposals.trialled(scopeOf("find", "brief.find", [], "part.0"), f.findProposal, "yes");
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const provider = mockProvider(async (request) => {
    seen.push(structuredClone(request));
    return judgeReply("yes");
  });
  const trials = automationStudioProjectBuildSubflowTrials({
    ref: REF, environment: environment as AutomationStudioProjectBuildTrialEnvironment, binding, judge: { provider }, records, proposals, leases: { assertCurrent: () => undefined }, running: () => true
  });
  const scope = scopeOf("add", "brief.add", predecessors);
  const proposal: AutomationStudioSubflowProposal = { ...f.request().proposal, scope: { buildId: "build.1", briefId: "brief.add", planDigest: "plan.1", subflowKey: "add" } };
  const leases = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })));
  const result = await leases.run({ role: "subflow_builder", briefId: "brief.add" }, async () => await trials.port({ scope, proposal, signal: new AbortController().signal }));
  expect(result.verdict, JSON.stringify(result.feedback)).toBe("yes");
  return seen;
}

describe("a subflow trial whose predecessor ran in it", () => {
  it("tells its judge which steps prepared the entry, that they are not this subflow's, and holds the out-of-scope rule to its own steps", async () => {
    const seen = await trialOfAdd(["find"]);
    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      const section = sectionOf(request);
      expect(section.entry?.subflows).toEqual(["find"]);
      const steps = section.entry?.steps ?? [];
      // The predecessor's own steps and the root's call to it; never a step of the subflow judged.
      expect(steps.some((step) => step.endsWith(".find.press"))).toBe(true);
      const calls = (request.context.resultSummary?.flowShape ?? []).filter((step) => typeof step.parameters?.subflowId === "string");
      expect(calls.filter((step) => steps.includes(step.nodeId)).map((step) => step.parameters!.subflowId)).toEqual([expect.stringMatching(/\.find$/u)]);
      expect(steps.some((step) => step.includes(".add."))).toBe(false);
      expect(section.supplementary).toContain("Before this subflow, this trial ran the subflows entry.subflows names, which prepare its entry");
      expect(section.supplementary).toContain("is never a reason to answer no, never a step to remove or change");
      expect(section.supplementary).toContain("A step of this subflow, one entry.steps does not hold, that does what an outOfScope part asks");
      const said = JSON.stringify(request.context);
      expect(said).toContain("after the earlier subflows that prepare its entry (taskChecklist.entry), which are not judged here");
      expect(said).not.toContain("This trial ran only the subflow");
    }
  });

  it("with no predecessor, is told exactly what it was", async () => {
    const seen = await trialOfAdd([]);
    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      const section = sectionOf(request);
      expect(section).not.toHaveProperty("entry");
      expect(section.supplementary).toContain("A step of this trial that does what an outOfScope part asks");
      expect(section.supplementary).not.toContain("entry");
      expect(JSON.stringify(request.context)).toContain("This trial ran only the subflow \\\"add\\\" of a larger Flow.");
    }
  });
});

// The A8 social trial's shape on a recipe review queue: the predecessor reads
// the queue, approves the entries with at least five votes and leaves out one
// entry that shows no count (not settled: it states no number); the subflow
// judged then reads the approved list. The yes accounts for the subflow's own
// left-out rows beside the request's words, and never names the predecessor's.
describe("the predecessor's read and press in a subflow trial", () => {
  const NS = "node.bootstrap.ns1";
  const flowNodes: AutomationStudioFlowNode[] = [
    { id: `${NS}.subflow-trial-root.start`, definitionId: "builtin.control.start" },
    { id: `${NS}.subflow-trial-root.call0`, definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "subflow.bootstrap.ns1.approve", inputs: {}, outputs: {} } },
    { id: `${NS}.subflow-trial-root.call1`, definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "subflow.bootstrap.ns1.record", inputs: {}, outputs: {} } },
    { id: `${NS}.approve.s2`, definitionId: "unit.list", parameterValues: { list: { fields: { title: { kind: "text" }, votes: { kind: "text" } }, where: [{ field: "votes", atLeast: 5 }] } } },
    { id: `${NS}.approve.s3`, definitionId: "unit.press", label: "approve the entry", parameterValues: { element: { tagName: "button", accessibleName: "Approve" } } },
    { id: `${NS}.record.s1`, definitionId: "unit.list", parameterValues: { list: { fields: { title: { kind: "text" }, status: { kind: "text" } }, where: [{ field: "status", contains: "Approved" }] } } }
  ];
  const read = (nodeId: string, order: number, aloneRows: JsonObject[], kept: number): AutomationStudioFlowRunActionAttemptRecord => ({
    attemptId: `a.${order}`, nodeId, definitionId: "unit.list", order, status: "succeeded", startedAt: order,
    metadata: { extraction: { recordCount: kept, pagesRead: 1, truncated: false, itemsSeen: kept + aloneRows.length, conditions: { applied: kept + aloneRows.length, kept, unfiltered: false, rejected: [aloneRows.length], alone: [aloneRows.length], aloneRows: [aloneRows] } } }
  });
  const summary = summarizeAutomationStudioRunResult({
    recordSets: [{
      summary: { runId: "trial.1", datasetId: "approved", nodeIds: [`${NS}.record.s1`], schemaDigest: "digest", recordCount: 2, truncated: false, invalidCount: 0, updatedAt: 1 },
      schema: { schemaVersion: "0.1", fields: ["title", "status"].map((id) => ({ id, label: id, valueType: "string" as const })) },
      rows: [{ title: "Lentil Soup", status: "Approved" }, { title: "Apple Pie", status: "Approved" }]
    }],
    flowNodes,
    actionAttempts: [
      read(`${NS}.approve.s2`, 1, [{ title: "Plum Tart", votes: "3 votes" }, { title: "Fig Jam", votes: "no votes shown" }], 2),
      { attemptId: "a.2", nodeId: `${NS}.approve.s3`, definitionId: "unit.press", order: 2, status: "succeeded", startedAt: 2 },
      read(`${NS}.record.s1`, 3, [{ title: "Quince Paste", status: "Pending" }, { title: "Melon Sorbet", status: "Pending" }], 2)
    ],
    deniedEvidenceKeys: [],
    now: 0
  });
  const predecessor = { subflows: [{ key: "approve", nodes: [{ key: "s2" }, { key: "s3" }] }] } as unknown as AutomationStudioSubflowProposal;
  const scope = scopeOf("record", "brief.record", ["approve"]);
  const instruction: AutomationStudioFlowInstruction = {
    schemaVersion: "0.1", instructionId: "project-scope.brief.record", title: "Subflow record", scope: { kind: "flow", projectId: "project", flowId: "parent" },
    body: "This trial ran the subflow \"record\" of a larger Flow, after the earlier subflows that prepare its entry (taskChecklist.entry), which are not judged here. Judge only whether it did these parts of the task:\n- then list every recipe the queue now shows as approved, with columns title and status",
    priority: 100, status: "active", requirement: "required", createdAt: 0, updatedAt: 0
  };
  const YES = "Quince Paste and Melon Sorbet are still pending, and the request asks only for \"every recipe the queue now shows as approved\". The two stored rows are the approved ones, in order.";
  const judged = async (withEntry: boolean) => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      seen.push(structuredClone(request));
      return judgeReply("yes", { observed: YES });
    });
    const entry = withEntry ? AutomationStudioProjectBuildTaskChecklist.entry(summary, [predecessor]) : undefined;
    const taskChecklist = await AutomationStudioProjectBuildTaskChecklist.subflow({ records, ref: REF }, scope, entry);
    const verdict = await automationStudioBuildTestJudge({ provider, instructions: [instruction], deniedEvidenceKeys: [], projectId: "project", flowId: "parent" })({ summary, taskChecklist });
    return { verdict, seen, entry };
  };

  it("finds the predecessor's read, its press and the root's call to it, and nothing of the subflow judged", () => {
    expect(AutomationStudioProjectBuildTaskChecklist.entry(summary, [predecessor])).toEqual({
      subflows: ["approve"],
      steps: [`${NS}.subflow-trial-root.call0`, `${NS}.approve.s2`, `${NS}.approve.s3`]
    });
    expect(AutomationStudioProjectBuildTaskChecklist.entry(summary, [])).toBeUndefined();
  });

  it("are not held against a yes that accounts for the subflow's own rows: it stands", async () => {
    const { verdict, seen } = await judged(true);
    expect(verdict.verdict, JSON.stringify(verdict)).toBe("yes");
    expect(seen.length).toBe(2);
  });

  it("held that same yes before t599: the predecessor's unsettled row was asked a quote its request cannot give", async () => {
    const { verdict } = await judged(false);
    expect(verdict.verdict).toBe("not_judged");
  });

  it("still hold the subflow's own rows to every rule: a yes that does not account for them is not taken", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      seen.push(request);
      return judgeReply("yes", { observed: "The two stored rows are the approved ones, in order." });
    });
    const taskChecklist = await AutomationStudioProjectBuildTaskChecklist.subflow({ records, ref: REF }, scope, AutomationStudioProjectBuildTaskChecklist.entry(summary, [predecessor]));
    const verdict = await automationStudioBuildTestJudge({ provider, instructions: [instruction], deniedEvidenceKeys: [], projectId: "project", flowId: "parent" })({ summary, taskChecklist });
    expect(verdict.verdict).toBe("not_judged");
    expect(JSON.stringify(seen.at(-1)?.context.resultSummary)).toContain("Quince Paste");
  });
});
