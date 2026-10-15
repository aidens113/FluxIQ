import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetTrialReset } from "../../site-reset/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialPort, type AutomationStudioFlowCandidate } from "../index.ts";

// t647: the whole-candidate gate has the subflow gate's gap (A8 bigbox debug, fix 6). A candidate build explores, the start
// hook takes back what its exploration did before each trial, and a Flow with no step for that act meets a page the build
// never explored. The fixtures are a library's: a reader's home branch, never a realistic scenario's site or task.

const HOME_BRANCH = "Make this my home branch";

function press(key: string, accessibleName: string): AutomationStudioFlowBootstrapSubflow["nodes"][number] {
  return { key, definitionId: "web.dom.click", definitionVersion: "1.0.0", parameters: { target: { kind: "element", fingerprint: { accessibleName } } }, consequences: ["modify_existing"] };
}

function candidateWith(nodes: AutomationStudioFlowBootstrapSubflow["nodes"]): AutomationStudioFlowCandidate {
  return { revision: 2, digest: "f".repeat(64), buildPlan: { summary: "Renew", plan: { subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] } } } as unknown as AutomationStudioFlowCandidate;
}

/** A candidate build that explored with one press on `name`, a start hook before each trial, and a trial answering `verdict`. */
function built(candidate: AutomationStudioFlowCandidate, verdict: "no" | "yes" = "no") {
  const ledger = new AutomationStudioSiteResetLedger();
  ledger.explored({ callId: "call.8", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: HOME_BRANCH, kind: "button" }, verb: "click" } });
  const reset: AutomationStudioSiteResetTrialReset = {
    beforeTrial: (_signal, cannotUndo, options) => ledger.beforeTrial(async () => ({ moved: false }), cannotUndo, options),
    trialRan: (acts, trialRunId) => ledger.trialRan(acts, trialRunId)
  };
  const port: AutomationStudioCandidateTrialPort = async (request) => ({ revision: request.revision, digest: request.digest, verdict, feedback: { code: `candidate.trial_judged_${verdict}` } });
  port.prepareStart = async () => "reset";
  return new AutomationStudioFlowCandidateTrialGate({ latest: () => structuredClone(candidate), trial: { candidateId: "candidate.1", port }, reset });
}

const ev = (ran: { evidence: unknown }): JsonObject => ran.evidence as JsonObject;
const receipt = (candidate: AutomationStudioFlowCandidate): JsonObject => ({ revision: candidate.revision, digest: candidate.digest });

describe("a whole-candidate trial on a page the build's exploration changed, and no step does (t647)", () => {
  it("names the act the start took back, as the act log records it, when no step of the Flow does it", async () => {
    const candidate = candidateWith([press("renew", "Renew all")]);
    const gate = built(candidate);
    const ran = await gate.test(receipt(candidate));
    expect(ev(ran).absorbedByStartReset).toEqual([{ act: "act-1", did: `click ${JSON.stringify(HOME_BRANCH)} button`, call: "call.8" }]);
    expect((ev(ran).feedback as JsonObject).coreFindings).toEqual([{
      code: "trial.explored_on_absorbed_act", act: "act-1", did: `click ${JSON.stringify(HOME_BRANCH)} button`, call: "call.8",
      said: expect.stringContaining("no step of this Flow does it")
    }]);
    expect(gate.standing(candidate)?.feedback.coreFindings).toHaveLength(1);
  });

  it("says nothing when a step of the Flow performs the same act, or of a yes", async () => {
    const doing = candidateWith([press("home", HOME_BRANCH), press("renew", "Renew all")]);
    expect(ev((await built(doing).test(receipt(doing)))).feedback).not.toHaveProperty("coreFindings");
    const passing = candidateWith([press("renew", "Renew all")]);
    expect(ev((await built(passing, "yes").test(receipt(passing)))).feedback).not.toHaveProperty("coreFindings");
  });
});
