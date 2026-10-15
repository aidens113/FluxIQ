// A builder whose loop throws after its latest proposal's trial answered yes is done on that trial's receipt (t611):
// the dispatcher keeps the last trial the brief's port answered beside the latest proposal Core accepted, and holds a
// throw to the same check a returned loop is held to. A throw with no such yes keeps the return it always had.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectBuilderPorts } from "../index.ts";
import { gardenBrief, gardenBuild, proposalFor, type BuilderScript } from "./dispatch-fixture.ts";

type Verdict = AutomationStudioSubflowTrialResult["verdict"];

/** Builder ports whose trial port answers `verdict`, its entry prepared. */
function portsAnswering(verdict: Verdict) {
  return (): AutomationStudioProjectBuilderPorts => ({
    loop: { tools: [], decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({ ok: true }) },
    submission: {} as unknown as AutomationStudioProjectBuilderPorts["submission"],
    deniedEvidenceKeys: [],
    trial: async (request) => ({ partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict, feedback: {} as JsonObject, trialRunId: `run.trial-${request.proposal.revision}`, entryPrepared: true })
  });
}

/** A builder that proposes revision 1, tries it, optionally proposes revision 2 untried, then throws. */
function throwsAfterTrial(replaced = false): BuilderScript {
  return async (input) => {
    const proposal = proposalFor(input);
    input.accepted?.(proposal);
    await input.trial!.port({ scope: input.scope, proposal, signal: input.loop.signal! });
    if (replaced) input.accepted?.({ ...proposal, revision: 2, digest: "d".repeat(64) });
    throw new Error("The page closed.");
  };
}

async function returnOf(verdict: Verdict, replaced = false) {
  const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], scripts: { "b-read": throwsAfterTrial(replaced) }, ports: { builder: portsAnswering(verdict) } });
  const { returns } = await build.run();
  return returns[0]!;
}

describe("a builder that throws", () => {
  it("after a standing yes for its latest proposal is done with that proposal and the trial's receipt", async () => {
    const returned = await returnOf("yes");
    expect(returned).toMatchObject({ briefId: "b-read", outcome: "done", proposal: { subflowKey: "list_seeds", revision: 1, digest: "c".repeat(64) }, trials: [{ kind: "subflow_trial", receiptId: "run.trial-1", verdict: "yes" }] });
    expect(returned.reason).toBe("Revision 1 of the subflow was tried on its own and its trial answered yes. The brief is done on that trial's receipt, though the builder did not complete with it. The builder failed: The page closed.");
  });

  it("with no standing yes keeps today's return, its failure first", async () => {
    const returned = await returnOf("unsure");
    expect(returned).toMatchObject({ outcome: "partial", proposal: { revision: 1 }, trials: [{ receiptId: "run.trial-1", verdict: "unsure" }] });
    expect(returned.reason).toBe("The builder failed: The page closed.");
  });

  it("after a yes of a revision it then replaced is not done", async () => {
    const returned = await returnOf("yes", true);
    expect(returned).toMatchObject({ outcome: "partial", proposal: { revision: 2, digest: "d".repeat(64) } });
    expect(returned.reason).toBe("The builder failed: The page closed.");
  });
});
