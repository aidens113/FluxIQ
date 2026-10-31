// A yes for a trial the site asked to slow down completes only once the Flow
// answers that itself (t485, D2 of `run-mv62icw0-070f88ad`): a pace at least
// the one the trial learned, and, when the run closed the site's notice by a
// named way out, a step that dismisses it and waits, inside the loop. The gate
// is driven directly with hand-made candidates; the feedback is shaped as the
// trial runner writes it (`../../../service/candidate-trial/feedback.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialRequest, type AutomationStudioFlowCandidate } from "../index.ts";
import type { AutomationStudioFlowBootstrapEdge, AutomationStudioFlowBootstrapNode } from "../../plan/index.ts";

const CLICK = "web.output.dom-click";

function candidate(nodes: AutomationStudioFlowBootstrapNode[], edges: AutomationStudioFlowBootstrapEdge[] = []): AutomationStudioFlowCandidate {
  const subflow = { key: "primary", name: "Primary", role: "primary" as const, nodes, edges };
  return {
    revision: 1, digest: "digest.1", baseDependencyDigest: "base", status: "draft", summary: "Archive each message", changedPaths: [],
    buildPlan: { plan: { schemaVersion: "0.1", router: { name: "Archive", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [subflow] }, risk: "low", subflows: [{ ...subflow, nodes: nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } })) }] }
  };
}

const node = (key: string, definitionId: string, extra: Partial<AutomationStudioFlowBootstrapNode> = {}): AutomationStudioFlowBootstrapNode => ({ key, definitionId, definitionVersion: "1.0.0", ...extra });
const link = (from: string, port: string, to: string): AutomationStudioFlowBootstrapEdge => ({ key: `${from}.${port}.${to}`, source: { nodeKey: from, portId: port }, target: { nodeKey: to, portId: "in" } });

/** The loop as first written: a listing, the act on each row, nothing for the notice. */
const BARE = [node("list", "web.output.dom-extract_list"), node("each", "builtin.control.for-each"), node("archive", CLICK, { label: "archive the message" })];

/** The same loop with a pace on its act and, after it, an optional dismiss and a wait that runs only after it, joined back into the pass. */
function handled(paceMs: number): AutomationStudioFlowCandidate {
  return candidate([
    BARE[0]!, BARE[1]!, node("archive", CLICK, { label: "archive the message", paceMs }),
    node("notice", CLICK, { label: "close the notice if it shows" }), node("cooldown", "builtin.timing.wait"), node("join", "builtin.control.merge")
  ], [link("each", "body", "archive"), link("archive", "success", "notice"), link("notice", "success", "cooldown"), link("notice", "failed", "join"), link("cooldown", "success", "join"), link("join", "success", "each")]);
}

/** A judged trial's steps: the act on pass 4 was refused and told to wait 4.5 s, and the run learned a 5.5 s pace. */
function slowedDown(interruption: JsonObject | undefined): JsonObject {
  return {
    steps: [
      { step: 1, definitionId: "web.output.dom-extract_list", status: "succeeded" },
      { step: 5, definitionId: CLICK, label: "archive the message", status: "succeeded", attempts: 2,
        absorbed: [{ failureCode: "test.slow_down", happened: "The site asked the run to slow down on pass 4, and to try again in 4.5 s.", pass: 4, askedWaitMs: 4_500, waitedMs: 4_500, paceMs: 4_500, said: "..." }],
        ...(interruption ? { interruptions: [interruption] } : {}) }
    ],
    paces: [{ definitionId: CLICK, label: "archive the message", paceMs: 5_500, said: "..." }]
  };
}

const NOTICE_WITH_WAY_OUT: JsonObject = { kind: "rate_limit", wayOut: "t30", said: "The page put the site's notice asking the run to slow down in the way, and the run closed it by pressing its way out, t30." };
const NOTICE_CLOSED_BY_RUN: JsonObject = { kind: "rate_limit", said: "The page put the site's notice asking the run to slow down in the way, and the run closed it by itself." };

async function trialOf(flow: AutomationStudioFlowCandidate, feedback: JsonObject) {
  const gate = new AutomationStudioFlowCandidateTrialGate({
    latest: () => flow,
    trial: { candidateId: "candidate.test", port: async (request: AutomationStudioCandidateTrialRequest) => ({ revision: request.revision, digest: request.digest, verdict: "yes", feedback, trialRunId: "trial.1" }) }
  });
  const tested = await gate.test({ revision: flow.revision, digest: flow.digest });
  return { evidence: tested.evidence as JsonObject, completion: gate.completion({ revision: flow.revision, digest: flow.digest }) };
}

describe("a passed trial the site asked to slow down", () => {
  it("is not told to complete while the Flow has no pace and no dismiss-and-wait for the named way out", async () => {
    const { evidence, completion } = await trialOf(candidate(BARE), slowedDown(NOTICE_WITH_WAY_OUT));

    expect(evidence.verdict).toBe("yes");
    expect(String(evidence.instruction)).not.toContain("Complete now");
    expect(String(evidence.instruction)).toContain("Core sets its pace to at least 5.5 s itself");
    expect(String(evidence.instruction)).toContain("5.5 s");
    expect(String(evidence.instruction)).toContain("t30");
    expect(String(evidence.instruction)).toContain("builtin.timing.wait");
    expect(evidence.slowDown).toEqual([{ step: 5, label: "archive the message", paceAtLeastMs: 5_500, wayOut: "t30", waitAtLeastMs: 4_500 }]);
    expect(completion).toMatchObject({ ok: false, issueCodes: ["candidate.trial_slow_down_unhandled"] });
  });

  it("completes when the Flow already holds the pace and the dismiss-and-wait inside the loop", async () => {
    const { evidence, completion } = await trialOf(handled(6_000), slowedDown(NOTICE_WITH_WAY_OUT));

    expect(String(evidence.instruction)).toContain("Complete now");
    expect(evidence).not.toHaveProperty("slowDown");
    expect(completion).toEqual({ ok: true });
  });

  it("still asks for the pace when the Flow's is shorter than the one the trial learned", async () => {
    const { evidence, completion } = await trialOf(handled(4_500), slowedDown(NOTICE_WITH_WAY_OUT));

    expect(evidence.slowDown).toEqual([{ step: 5, label: "archive the message", paceAtLeastMs: 5_500 }]);
    expect(completion).toMatchObject({ ok: false, issueCodes: ["candidate.trial_slow_down_unhandled"] });
  });

  it("still asks for the dismiss-and-wait when the Flow has the pace alone and the notice's way out was named", async () => {
    const paced = candidate([BARE[0]!, BARE[1]!, node("archive", CLICK, { label: "archive the message", paceMs: 5_500 })]);
    const { evidence } = await trialOf(paced, slowedDown(NOTICE_WITH_WAY_OUT));

    expect(evidence.slowDown).toEqual([{ step: 5, label: "archive the message", wayOut: "t30", waitAtLeastMs: 4_500 }]);
  });

  it("asks for the pace alone when the run closed the notice itself, and completes once the Flow holds it", async () => {
    const bare = await trialOf(candidate(BARE), slowedDown(NOTICE_CLOSED_BY_RUN));
    expect(bare.evidence.slowDown).toEqual([{ step: 5, label: "archive the message", paceAtLeastMs: 5_500 }]);
    expect(String(bare.evidence.instruction)).not.toContain("builtin.timing.wait");

    const paced = await trialOf(candidate([BARE[0]!, BARE[1]!, node("archive", CLICK, { label: "archive the message", paceMs: 5_500 })]), slowedDown(NOTICE_CLOSED_BY_RUN));
    expect(paced.completion).toEqual({ ok: true });
  });

  it("is a plain yes when the run only closed a layer that asked for no slowing down", async () => {
    const feedback = { steps: [{ step: 2, definitionId: CLICK, label: "open the inbox", status: "succeeded", interruptions: [{ kind: "consent", said: "..." }] }] };
    const { evidence, completion } = await trialOf(candidate(BARE), feedback);

    expect(String(evidence.instruction)).toContain("Complete now");
    expect(completion).toEqual({ ok: true });
  });
});
