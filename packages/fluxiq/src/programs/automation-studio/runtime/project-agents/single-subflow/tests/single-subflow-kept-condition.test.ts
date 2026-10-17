// A single-subflow plan's builder is held to the conditions Core's record kept
// (t689, `../single-subflow-trial.ts`), through the supervisor's loop on a
// scripted provider and the build of `./gated-single-build.ts`: the builder's
// first test is the judged whole run, judged no, whose record shows one of its
// list read's conditions left out only a row the request does not ask for; the
// builder's next proposal drops that condition and its own controller refuses
// it once, as on a plan of several subflows; the same drop sent again is
// accepted. Then what the builder's gate keeps of that test is compared, field
// by field, with what it keeps of a scoped subflow trial of the same proposal
// carrying the same record. A lending library's catalogue; no realistic Lab
// scenario's task, site or answer.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { planInput, subflow, taskSpecInput } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, brief, call, dispatch, lastOf, supervise, type Step } from "../../supervisor/tests/supervisor-script.ts";
import { gatedSingleBuild } from "./gated-single-build.ts";

const ONE_PART = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const completeOnDispatch: Step = (evidence) => ({ kind: "complete", result: lastOf(evidence, IDS.dispatch)!.complete as JsonObject });

/** The read's two conditions, as the exact revision writes them. */
const NOT_BOXED = { field: "title", not: true, contains: "Boxed set" };
const BY_AUTHOR = { field: "author", contains: "Ada Hart" };
/** NOT_BOXED as Core matches a condition by how it is written: JSON with its keys sorted. */
const NOT_BOXED_WRITTEN = '{"contains":"Boxed set","field":"title","not":true}';

function readScript(where: readonly JsonObject[]): string[] {
  return ["flow: find newest", "step: read the titles", "  node: web.output.read-list", `  readList: ${JSON.stringify({ fields: { title: "title", author: "author" }, where })}`];
}

/** Core's record of a trial judged no: condition 1 alone left out one row, a copy of a stored one; condition 2 left out nothing by itself. */
function record(readNodeId: string): JsonObject {
  return {
    stored: ["The Quiet Harbour", "Lanterns at Dusk", "Salt and Cedar"],
    storedWhole: true,
    conditions: [
      { name: "condition 1 (title does not contain Boxed set)", nodeId: readNodeId, number: 1, leftOutAlone: ["Boxed set: The Quiet Harbour"], keptOut: [{ label: "Boxed set: The Quiet Harbour", by: "also_in_result" }] },
      { name: "condition 2 (author contains Ada Hart)", nodeId: readNodeId, number: 2 }
    ],
    standing: [{ call: 1, drops: ["title does not contain boxed set"] }]
  };
}

/** The read step's node id in a plan of subflows, by its subflow's and its own key, as a Flow names it. */
function readNodeIdIn(subflows: ReadonlyArray<{ key: string; nodes: ReadonlyArray<{ key: string; definitionId: string }> }>, readListId: string): string {
  const owner = subflows.find((one) => one.nodes.some((node) => node.definitionId === readListId))!;
  return `node.bootstrap.0a1b2c3d.${owner.key}.${owner.nodes.find((node) => node.definitionId === readListId)!.key}`;
}

/** `untested`: proposals the builder submits first and never tests, so the exact proposal's revision is not the whole Flow's. */
function build(untested = 0) {
  const verdicts = ["no", "yes"] as const;
  const exact = readScript([NOT_BOXED, BY_AUTHOR]);
  const dropped = readScript([BY_AUTHOR]);
  const first = Array.from({ length: untested }, (_none, index) => readScript([{ field: "author", contains: `Ada Hart ${index + 1}` }]));
  const built: ReturnType<typeof gatedSingleBuild> = gatedSingleBuild({
    scripts: [...first, exact, dropped, dropped],
    untested,
    trial: (attempt) => verdicts[attempt - 1] ?? "no",
    standingNo: (candidate, verdict) => (verdict === "no" ? record(readNodeIdIn(candidate.buildPlan.plan.subflows, built.readListId)) : undefined)
  });
  return built;
}

describe("a single-subflow plan's builder, after its judged whole run kept a condition (t689)", () => {
  it("refuses once a proposal that drops it, as a scoped brief's controller does, and accepts the same drop sent again", async () => {
    const built = build();
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);
    const [first, refused, again] = built.submitted;
    expect(first?.ok).toBe(true);
    // The first test was the judged whole run, judged no; nothing a model is shown carries the kept conditions.
    expect(built.tested[0]!.resultCode).toBe("subflow.trial_no");
    expect(JSON.stringify(built.tested[0]!.evidence)).not.toContain("keptConditions");
    const { gate, accepted } = built.gates[0]!;
    expect(gate.standing(accepted[0])).toMatchObject({ verdict: "no", keptConditions: [{ name: "condition 1 (title does not contain Boxed set)", revision: accepted[0]!.revision, written: NOT_BOXED_WRITTEN }] });

    expect(refused?.ok).toBe(false);
    if (!refused || refused.ok) return;
    expect(refused.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE]);
    const said = String(refused.check.feedback?.instruction);
    expect(said).toContain(`Condition 1 (title does not contain Boxed set), as revision ${accepted[0]!.revision} wrote it`);
    expect(said).toContain("this subflow no longer writes it as it was written");

    // A hint, never a block: the same drop sent again is a new proposal, and its whole test completes the build.
    expect(again?.ok).toBe(true);
    expect(built.tested.map((answer) => answer.resultCode)).toEqual(["subflow.trial_no", "subflow.trial_yes"]);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
  });

  it("names the condition by the builder's own revision, not the whole Flow's", async () => {
    const built = build(1);
    await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);
    const { gate, accepted } = built.gates[0]!;
    const exact = accepted[1]!;
    // The whole Flow's first revision was assembled from the builder's second.
    expect(exact.revision).toBe(2);
    expect((gate.standing(exact)?.feedback as JsonObject).complete).toMatchObject({ revision: 1 });
    expect(gate.standing(exact)).toMatchObject({ keptConditions: [{ revision: 2, written: NOT_BOXED_WRITTEN }] });
    const refused = built.submitted[2];
    expect(refused?.ok).toBe(false);
    if (!refused || refused.ok) return;
    expect(String(refused.check.feedback?.instruction)).toContain("Condition 1 (title does not contain Boxed set), as revision 2 wrote it");
  });

  // Coordinator, t689: a single-path repair rebuilds the same subflow, and Core keeps a condition from any of its trials (t633, t644).
  it("holds a repair brief of the subflow to the condition the build brief's judged run kept, refusing its drop once", async () => {
    const exact = readScript([NOT_BOXED, BY_AUTHOR]);
    const repaired = readScript([NOT_BOXED, BY_AUTHOR, { field: "year", atLeast: 2020 }]);
    const dropped = readScript([BY_AUTHOR, { field: "year", atLeast: 2020 }]);
    const verdicts = ["no", "no", "yes"] as const;
    let judged = 0;
    const built: ReturnType<typeof gatedSingleBuild> = gatedSingleBuild({
      scripts: (sent) => (sent.kind === "repair" ? [repaired, dropped, dropped] : [exact]),
      trial: (attempt) => verdicts[attempt - 1] ?? "no",
      // Only the build brief's run carries a record: whatever the repair's gate holds of condition 1 is inherited.
      standingNo: (candidate) => (++judged === 1 ? record(readNodeIdIn(candidate.buildPlan.plan.subflows, built.readListId)) : undefined)
    });
    const repair: Step = (evidence) => {
      const failing = (lastOf(evidence, IDS.dispatch)!.returns as JsonObject[])[0]!.trials as JsonObject[];
      const { kind, receiptId, digest } = failing.at(-1)! as { kind: string; receiptId: string; digest: string };
      return call(IDS.dispatch, { reason: "The whole run was judged no.", briefs: [brief("find_newest", ["p1"], [], { kind: "repair", failingReceipt: { kind, receiptId, digest } })] })(evidence);
    };
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), repair, completeOnDispatch], built);
    expect(built.gates.map((one) => one.scope.briefId)).toHaveLength(2);
    const [first, second] = built.gates;
    expect(first!.scope.briefId).not.toBe(second!.scope.briefId);
    expect(first!.gate.standing(first!.accepted[0])).toMatchObject({ verdict: "no", keptConditions: [{ written: NOT_BOXED_WRITTEN }] });
    // The repair's own first test carried no record, and its gate holds the build brief's condition, named by that brief's revision.
    expect(second!.gate.standing(second!.accepted[0])).toMatchObject({ verdict: "no", keptConditions: [{ name: "condition 1 (title does not contain Boxed set)", revision: first!.accepted[0]!.revision, written: NOT_BOXED_WRITTEN }] });
    const [, , refused, again] = built.submitted;
    expect(refused?.ok).toBe(false);
    if (!refused || refused.ok) return;
    expect(refused.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE]);
    expect(again?.ok).toBe(true);
    expect(built.tested.map((answer) => answer.resultCode)).toEqual(["subflow.trial_no", "subflow.trial_no", "subflow.trial_yes"]);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
  });

  it("keeps of its judged whole run what a scoped subflow trial's gate keeps, field by field, but for the fields listed with their reasons", async () => {
    const built = build();
    await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), completeOnDispatch], built);
    const { gate, scope, accepted } = built.gates[0]!;
    const proposal = accepted[0]!;
    const single = gate.standing(proposal) as unknown as Record<string, unknown>;

    // The same proposal through a scoped gate, its port answering as the subflow trial service does (`service/subflow-trial/run.ts`).
    const scopedResult = scopedTrial(proposal, built.readListId);
    const scopedGate = new AutomationStudioSubflowTrialGate({ scope, latest: () => proposal, port: async () => structuredClone(scopedResult) });
    await scopedGate.test({ revision: proposal.revision, digest: proposal.digest });
    const scoped = scopedGate.standing(proposal) as unknown as Record<string, unknown>;

    /** The fields deliberately different, each with why. */
    const deliberate: Record<string, string> = {
      // The whole test's own feedback, with its revision, digest and the complete object beside it (`../single-subflow-trial.ts`).
      feedback: "what the judged whole run said, in the builder's terms",
      // Recorded under the supervisor by the whole trial port (`service/project-build/whole-trials.ts`); carried here, recorded twice.
      acts: "the whole run's acts are the supervisor's",
      // Each run's own id: present on both, never the same run.
      trialRunId: "each run's own id"
    };
    for (const field of new Set([...Object.keys(single), ...Object.keys(scoped)])) {
      if (field in deliberate) continue;
      expect(single[field], `field ${field}`).toEqual(scoped[field]);
    }
    expect(Object.keys(scoped).sort()).toEqual(["acts", "digest", "entryPrepared", "feedback", "identity", "keptConditions", "partial", "revision", "scope", "trialRunId", "verdict"]);
    expect(Object.keys(single).sort()).toEqual(["digest", "entryPrepared", "feedback", "identity", "keptConditions", "partial", "revision", "scope", "trialRunId", "verdict"]);
    expect(single.feedback).toMatchObject({ wholeTest: { verdict: "no" }, complete: { revision: expect.any(Number), digest: expect.any(String) } });
    expect(typeof single.trialRunId).toBe("string");
    // Core's record itself is not carried on the single path: the whole gate weighs a later no against it, for every brief of the build.
    expect(scopedResult).toHaveProperty("standingNo");
  });
});

/** A scoped subflow trial of `proposal`, judged no, carrying Core's record of it beside its feedback and one lasting act. */
function scopedTrial(proposal: AutomationStudioSubflowProposal, readListId: string): AutomationStudioSubflowTrialResult & { standingNo: unknown } {
  return {
    partial: true, scope: "subflow", identity: { ...proposal.scope }, revision: proposal.revision, digest: proposal.digest, verdict: "no",
    feedback: { code: "candidate.trial_judged_no" }, trialRunId: "scoped-run-1", entryPrepared: true,
    acts: [{ step: 1, definitionId: "web.output.dom-click", consequences: ["create_new"] }],
    standingNo: record(readNodeIdIn(proposal.subflows, readListId))
  };
}
