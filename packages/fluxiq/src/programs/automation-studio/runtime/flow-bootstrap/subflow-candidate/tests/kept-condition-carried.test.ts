// The kept conditions a port carries, found by another gate (t689,
// `../subflow-trial-gate.ts`): a single-subflow plan's whole test hands the
// builder's gate the whole gate's kept conditions on the builder's numbering
// (`../../../project-agents/single-subflow/single-subflow-trial.ts`), since
// its answer carries no record of its own. The gate keeps them on the result it
// keeps for the trial, never in what a model is shown; the brief's controller
// refuses once a proposal that drops one; a later prepared trial's list
// replaces it; a trial whose entry was not prepared leaves it; and they sit
// beside the conditions the gate's own memory found, once each. The campsite
// search of `../../candidate/tests/kept-condition/tests/kept-condition-fixture.ts`.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE } from "../../candidate/index.ts";
import { CAMP_WHERE, KEPT_CONDITION_SUBMISSION, campsiteReadScript as script } from "../../candidate/tests/kept-condition/tests/kept-condition-fixture.ts";
import { AutomationStudioSubflowScopedSubmissionController, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { SIBLINGS, testScope } from "./subflow-fixture.ts";

const { promoted, open, rating, campground, notCabin } = CAMP_WHERE;
const scope = testScope();

/** `promoted` as another gate kept it: as revision 1 wrote it, keeping out one copy of a stored row. */
const PROMOTED_KEPT = { name: "condition 1 (promoted is absent)", revision: 1, written: '{"field":"promoted","is":"absent"}', keptOut: [{ label: "Pine Hollow Campground (promoted)", by: "also_in_result" }] };
/** `open` as another gate kept it. */
const OPEN_KEPT = { name: "condition 2 (availability contains Open this weekend)", revision: 1, written: '{"contains":"Open this weekend","field":"availability"}', keptOut: [{ label: "Ridge Campground", by: "also_in_result" }] };

type Answer = { verdict?: AutomationStudioSubflowTrialResult["verdict"]; entryPrepared?: boolean; keptConditions?: unknown; standingNo?: unknown };

/** A brief whose port answers each trial as `answers` says, in turn, with what each carries beside its feedback. */
function brief(...answers: Answer[]) {
  const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: KEPT_CONDITION_SUBMISSION });
  let asked = 0;
  const port = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    const { verdict = "no", entryPrepared = true, keptConditions, standingNo } = answers[asked++] ?? {};
    return {
      partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict, entryPrepared,
      feedback: { code: `candidate.trial_judged_${verdict}` },
      ...(keptConditions !== undefined ? { keptConditions } : {}), ...(standingNo !== undefined ? { standingNo } : {})
    } as AutomationStudioSubflowTrialResult;
  };
  const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => controller.latest(), port, whole: true });
  const history = { trialOf: (proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest">) => gate.standing(proposal), refuted: (digest: string) => gate.refuted(digest) };
  return { gate, submit: (input: JsonObject) => controller.submit(input, history) };
}

/** The kept conditions the gate keeps on the result of `proposal`'s trial, outside what a model is shown. */
function keptOf(gate: AutomationStudioSubflowTrialGate, proposal: AutomationStudioSubflowProposal): unknown {
  return (gate.standing(proposal) as (AutomationStudioSubflowTrialResult & { keptConditions?: unknown }) | undefined)?.keptConditions;
}

async function proposed(submitted: ReturnType<ReturnType<typeof brief>["submit"]>): Promise<AutomationStudioSubflowProposal> {
  const result = await submitted;
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  return result.proposal;
}

describe("kept conditions a subflow trial port carries (t689)", () => {
  it("are kept on the trial's result, never shown, and a proposal dropping one is refused once", async () => {
    const { gate, submit } = brief({ verdict: "no", keptConditions: [PROMOTED_KEPT] });
    const exact = await proposed(submit(script([promoted, open, rating, campground, notCabin])));
    const trial = await gate.test({ revision: exact.revision, digest: exact.digest });
    expect(trial.resultCode).toBe("subflow.trial_no");
    expect(JSON.stringify(trial.evidence)).not.toContain("keptConditions");
    expect(gate.standing(exact)).toMatchObject({ keptConditions: [PROMOTED_KEPT] });

    const dropped = await submit(script([open, rating, campground, notCabin]));
    expect(dropped.ok).toBe(false);
    if (dropped.ok) return;
    expect(dropped.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE]);
    expect(String(dropped.check.feedback?.instruction)).toContain("Condition 1 (promoted is absent), as revision 1 wrote it");
    await proposed(submit(script([open, rating, campground, notCabin])));
  });

  it("are replaced by a later prepared trial's list, and left as they were by a trial whose entry was not prepared", async () => {
    const { gate, submit } = brief(
      { verdict: "unsure", keptConditions: [PROMOTED_KEPT] },
      { verdict: "execution_failed", entryPrepared: false, keptConditions: [] },
      { verdict: "unsure", keptConditions: [] }
    );
    const exact = await proposed(submit(script([promoted, open, rating, campground, notCabin])));
    await gate.test({ revision: exact.revision, digest: exact.digest });
    expect(keptOf(gate, exact)).toEqual([PROMOTED_KEPT]);
    // Not prepared: what the trial carried says nothing of this subflow, so the list stands.
    await gate.test({ revision: exact.revision, digest: exact.digest });
    expect(keptOf(gate, exact)).toEqual([PROMOTED_KEPT]);
    // The other gate no longer keeps it: neither does this one, and the drop is accepted.
    await gate.test({ revision: exact.revision, digest: exact.digest });
    expect(keptOf(gate, exact)).toBeUndefined();
    await proposed(submit(script([open, rating, campground, notCabin])));
  });

  it("sit beside the conditions the gate's own memory found, once each", async () => {
    // The gate's own record of the trial keeps `promoted`, as its node names it (`node.bootstrap.<id>.<subflow>.<step>`).
    const ownRecord = (readNodeId: string) => ({ stored: ["Ridge Campground"], storedWhole: true, conditions: [{ name: "condition 1 (promoted is absent)", nodeId: readNodeId, number: 1, leftOutAlone: ["Pine Hollow Campground (promoted)"], keptOut: [{ label: "Pine Hollow Campground (promoted)", by: "also_in_result" }] }], standing: [{ call: 1 }] });
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: KEPT_CONDITION_SUBMISSION });
    const exact = await proposed(controller.submit(script([promoted, open, rating, campground, notCabin])));
    const read = exact.subflows.find((subflow) => subflow.key === scope.subflowKey)!;
    const readNodeId = `node.bootstrap.0a1b2c3d.${read.key}.${read.nodes[0]!.key}`;
    const gate = new AutomationStudioSubflowTrialGate({
      scope, latest: () => controller.latest(),
      port: async (request) => ({ partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "no", entryPrepared: true, feedback: { code: "candidate.trial_judged_no" }, standingNo: ownRecord(readNodeId), keptConditions: [{ ...PROMOTED_KEPT, name: "condition 1 (as the other gate named it)" }, OPEN_KEPT] }) as AutomationStudioSubflowTrialResult
    });
    await gate.test({ revision: exact.revision, digest: exact.digest });
    // `promoted` as this gate's own record named it, then `open` as carried: the carried copy of `promoted` is not kept twice.
    const kept = keptOf(gate, exact) as Array<{ name: string; written: string }> | undefined;
    expect(kept?.map((condition) => [condition.name, condition.written])).toEqual([[PROMOTED_KEPT.name, PROMOTED_KEPT.written], [OPEN_KEPT.name, OPEN_KEPT.written]]);
  });
});
