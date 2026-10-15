// The build's proposals keep a subflow trial's verdict as the brief's gate
// weighed it (t634): the port answers before the gate weighs the trial, so each
// trial it answered is told to the proposals when the gate tells the port what
// it kept (`weighed`). Through the real project-build port; no model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler } from "../../../project-agents/host-resources/index.ts";
import { StubHost } from "../../../project-agents/host-resources/tests/stub-host.ts";
import type { AutomationStudioProjectBuildRecordStore } from "../../../project-agents/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { subflowTrialFixture } from "../../subflow-trial/tests/fixtures.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import { automationStudioProjectBuildSubflowTrials } from "../subflow-trials.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";

const REF = { projectId: "project", flowId: "parent", buildId: "build.1" };
const binding = { domainId: "test", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {} }) } as unknown as AutomationStudioLlmEvidenceRuntimeBinding;
const records = { read: async () => ({
  record: {
    plans: [{ plan: { digest: "plan.1", taskSpecDigest: "spec.1" } }],
    taskSpecs: [{ taskSpec: { digest: "spec.1", notAsked: [], parts: [{ id: "part.1", quote: { sourceId: "instruction", text: "carry out its part" }, goalFacts: [], lastingActs: [] }] } }]
  }
}) } as unknown as Pick<AutomationStudioProjectBuildRecordStore, "read">;
const scope: AutomationStudioSubflowScope = { buildId: "build.1", briefId: "brief.add", planDigest: "plan.1", subflowKey: "add", predecessors: [], parts: [{ partId: "part.1", sourceId: "instruction", text: "carry out its part" }], interface: { inputs: [], outputs: [] } };

async function trialled() {
  const f = subflowTrialFixture();
  const { judge: _judge, predecessorProposals: _predecessors, ...environment } = f.ports;
  const proposals = new AutomationStudioProjectBuildProposals();
  const told: string[] = [];
  const inner = proposals.trialled.bind(proposals);
  proposals.trialled = (at, proposal, verdict) => {
    told.push(verdict);
    inner(at, proposal, verdict);
  };
  const trials = automationStudioProjectBuildSubflowTrials({
    ref: REF, environment: environment as AutomationStudioProjectBuildTrialEnvironment, binding, judge: { provider: mockProvider(async () => judgeReply("yes")) }, records, proposals, leases: { assertCurrent: () => undefined }, running: () => true
  });
  const proposal: AutomationStudioSubflowProposal = { ...f.request().proposal, scope: { buildId: "build.1", briefId: "brief.add", planDigest: "plan.1", subflowKey: "add" } };
  const leases = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })));
  const result = await leases.run({ role: "subflow_builder", briefId: "brief.add" }, async () => await trials.port({ scope, proposal, signal: new AbortController().signal }));
  return { trials, proposals, proposal, result, told };
}

describe("the build's proposals, told a subflow trial (t634)", () => {
  it("keep the verdict the gate weighed, told once, and not the port's own", async () => {
    const { trials, proposals, proposal, result, told } = await trialled();
    expect(result.verdict).toBe("yes");
    // Not told before the gate weighs the trial.
    expect(told).toEqual([]);
    const weighed = trials.port.weighed!;
    weighed({ answer: { ...result, verdict: "unsure" } });
    expect(told).toEqual(["unsure"]);
    // An unsure is no pass, so no later subflow's entry is prepared from it; the proposal is still named.
    expect(proposals.predecessors({ ...scope, predecessors: ["add"] })).toEqual([]);
    expect(proposals.byRef({ briefId: "brief.add", subflowKey: "add", revision: proposal.revision, digest: proposal.digest })).toBeDefined();
    // Told once: the gate's answer again, or one for a trial this port never answered, tells nothing.
    weighed({ answer: { ...result, verdict: "yes" } });
    weighed({ answer: { ...result, revision: result.revision + 1 } });
    expect(told).toEqual(["unsure"]);
  });

  it("keep a yes the gate kept as a pass", async () => {
    const { trials, proposals, result, told } = await trialled();
    trials.port.weighed!({ answer: result });
    expect(told).toEqual(["yes"]);
    expect(proposals.predecessors({ ...scope, predecessors: ["add"] })).toHaveLength(1);
  });
});
