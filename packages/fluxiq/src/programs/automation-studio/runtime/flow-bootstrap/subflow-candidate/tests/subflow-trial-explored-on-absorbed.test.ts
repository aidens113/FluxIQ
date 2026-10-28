import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { AutomationStudioSiteResetProjectLedger, automationStudioSiteResetProjectReset, type AutomationStudioSiteResetExplored } from "../../site-reset/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

// t647 (A8 bigbox debug `run-mv9zn5ob-d929084d`, fix 6): a builder changed the site while exploring, built on the page
// that left, and every trial's start hook took the act back; no step did it, and nothing told the builder why each trial
// met another page. The fixtures are a library's: a reader's home branch, never a realistic scenario's site or task.

const scope = testScope({ briefId: "brief-5", subflowKey: "renew_loans", predecessors: ["sign_in"] });
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const HOME_BRANCH = "Make this my home branch";

function explored(callId: string, name: string, consequences: AutomationStudioActionConsequence[] = ["modify_existing"]): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name, kind: "button" }, verb: "click" } };
}

function press(key: string, accessibleName: string): AutomationStudioFlowBootstrapSubflow["nodes"][number] {
  return { key, definitionId: "web.dom.click", definitionVersion: "1.0.0", parameters: { target: { kind: "element", fingerprint: { accessibleName } } }, consequences: ["modify_existing"] };
}

function proposalWith(nodes: AutomationStudioFlowBootstrapSubflow["nodes"]): AutomationStudioSubflowProposal {
  return { scope: identity, revision: 3, digest: "e".repeat(64), subflows: [{ key: scope.subflowKey, name: "Renew loans", role: "primary", nodes, edges: [] }], summary: "Renew", changedPaths: [] };
}

/** A project build whose brief explored with `pressed`, a start hook before each trial, and a port answering `overrides`. */
function built(input: { proposal: AutomationStudioSubflowProposal; pressed: Array<{ brief: string; call: string; name: string }>; overrides?: Partial<AutomationStudioSubflowTrialResult> }) {
  const project = new AutomationStudioSiteResetProjectLedger();
  project.observed({ state: {}, differs: [], resource: "r:fixture", scope: "p:fixture", collections: [{ scope: "p:controls", group: "g:controls", subjects: [], states: {} }] });
  const own = project.forBrief(scope.briefId);
  for (const subflow of input.proposal.subflows) {
    for (const node of subflow.nodes) {
      const witness = own.admitStep({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Press", kind: "button", resource: "r:fixture", scope: "p:controls" } }, node.definitionId);
      if (!witness) throw new Error("fixture step needs a witnessed original");
      node.resetWitness = witness;
    }
  }
  for (const { brief, call, name } of input.pressed) project.forBrief(brief).explored(explored(call, name));
  const reset = automationStudioSiteResetProjectReset({ project, own: project.forBrief(scope.briefId), checks: () => ({ compare: async () => ({ moved: false }) }) });
  const port: AutomationStudioSubflowTrialPreparingPort = async (request: AutomationStudioSubflowTrialRequest) => ({
    partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest,
    verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { observed: "The renewal button was not offered." } }, entryPrepared: true, trialRunId: "trial.1", ...input.overrides
  });
  port.prepareStart = async () => "reset";
  return new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(input.proposal), port, reset });
}

const ev = (ran: { evidence: unknown }): JsonObject => ran.evidence as JsonObject;
const receipt = (proposal: AutomationStudioSubflowProposal): JsonObject => ({ revision: proposal.revision, digest: proposal.digest });

describe("a subflow trial on a page this brief's exploration changed, and no step does (t647)", () => {
  it("names the act the start took back, as the act log records it, when no step of the subflow does it", async () => {
    const proposal = proposalWith([press("renew", "Renew all")]);
    const gate = built({ proposal, pressed: [{ brief: scope.briefId, call: "call.12", name: HOME_BRANCH }] });
    const ran = await gate.test(receipt(proposal));
    const feedback = ev(ran).feedback as JsonObject;
    expect(feedback.code).toBe("candidate.trial_judged_no");
    expect(feedback.coreFindings).toEqual([{
      code: "trial.explored_on_absorbed_act", act: "act-1", did: `click ${JSON.stringify(HOME_BRANCH)} button`, call: "call.12",
      said: expect.stringContaining("no step of this subflow, nor of a subflow run before it, does it")
    }]);
    expect(String((feedback.coreFindings as JsonObject[])[0]!.said)).toContain("changed by an act this trial's start undid");
    // The act is still named as before, and the model never sees who recorded it or its control's name apart from what it did.
    expect(ev(ran).absorbedByStartReset).toEqual([{ act: "act-1", did: `click ${JSON.stringify(HOME_BRANCH)} button`, call: "call.12" }]);
    // The finding rides on the verdict the gate keeps, which the completion refusal and the dispatcher read.
    expect(gate.standing(proposal)?.feedback.coreFindings).toHaveLength(1);
    expect(gate.completion(proposal)).toMatchObject({ ok: false, feedback: { previousFeedback: { coreFindings: [{ code: "trial.explored_on_absorbed_act", act: "act-1" }] } } });
  });

  it("says nothing when a step of the subflow performs the same act", async () => {
    const proposal = proposalWith([press("home", HOME_BRANCH), press("renew", "Renew all")]);
    const gate = built({ proposal, pressed: [{ brief: scope.briefId, call: "call.12", name: HOME_BRANCH }] });
    const ran = await gate.test(receipt(proposal));
    expect(ev(ran).absorbedByStartReset).toEqual([{ act: "act-1", did: `click ${JSON.stringify(HOME_BRANCH)} button`, call: "call.12" }]);
    expect(ev(ran).feedback).not.toHaveProperty("coreFindings");
  });

  it("says nothing when a predecessor's step performed the same act in the trial", async () => {
    const proposal = proposalWith([press("renew", "Renew all")]);
    const gate = built({ proposal, pressed: [{ brief: scope.briefId, call: "call.12", name: HOME_BRANCH }], overrides: { acts: [{ step: 2, definitionId: "web.dom.click", label: "Choose the home branch", control: HOME_BRANCH, consequences: ["modify_existing"] }] } });
    expect(ev((await gate.test(receipt(proposal)))).feedback).not.toHaveProperty("coreFindings");
  });

  it("says nothing of another brief's act, of a yes, or of a trial whose entry was not prepared", async () => {
    const proposal = proposalWith([press("renew", "Renew all")]);
    const other = built({ proposal, pressed: [{ brief: "brief-4", call: "call.3", name: HOME_BRANCH }] });
    const otherRan = await other.test(receipt(proposal));
    expect(ev(otherRan).absorbedByStartReset).toEqual([{ act: "act-1", did: `click ${JSON.stringify(HOME_BRANCH)} button`, call: "call.3" }]);
    expect(ev(otherRan).feedback).not.toHaveProperty("coreFindings");
    const yes = built({ proposal, pressed: [{ brief: scope.briefId, call: "call.12", name: HOME_BRANCH }], overrides: { verdict: "yes", feedback: { said: "ok" } } });
    expect(ev((await yes.test(receipt(proposal)))).feedback).not.toHaveProperty("coreFindings");
    const unprepared = built({ proposal, pressed: [{ brief: scope.briefId, call: "call.12", name: HOME_BRANCH }], overrides: { entryPrepared: false, verdict: "execution_failed", feedback: { code: "subflow.entry_not_prepared" } } });
    expect(ev((await unprepared.test(receipt(proposal)))).feedback).not.toHaveProperty("coreFindings");
  });
});
