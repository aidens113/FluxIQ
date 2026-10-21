// A stub-judge replay of A8 frozen pair 8 candidate towels
// `run-mvam0lys-2d3eb090` revision 7 (t666) through the build-test judge, the
// whole-candidate trial gate and the submission controller, on the campsite
// search of `./kept-condition-fixture.ts`: the two name conditions left out
// no row by themselves and together left out one row, another copy of which
// the result kept. Core's record carries that set, the gate keeps it as one,
// and a submission dropping both name conditions is refused once, in Core's
// words naming them together; dropping one is never refused, and the same
// drop sent again is accepted. A set whose row Core cannot account for -- a
// row's own name is never the request's words (t651) -- is not kept. No task,
// site, item or answer of any realistic scenario; the provider is scripted.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider } from "../../../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestVerdict, type AutomationStudioRunResultSummary } from "../../../../../result-verification/index.ts";
import { CAMP_BLUEWATER, CAMP_READ, campsiteInstruction, campsiteRunSummary } from "../../../../../result-verification/refuted-no/tests/campsite-fixture.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE,
  AutomationStudioFlowCandidateSubmissionController,
  AutomationStudioFlowCandidateTrialGate,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioFlowCandidate
} from "../../../index.ts";
import { CAMP_WHERE, GAP_AND_CHANGE_NO, GAP_NO, KEPT_CONDITION_SUBMISSION, campsiteReadScript as script } from "./kept-condition-fixture.ts";

const { promoted, open, rating, campground, notCabin } = CAMP_WHERE;
const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
/** A row the two name conditions left out together, by itself named no stored row's way. */
const UNACCOUNTED = "Lakeview Group Cabins, Site 9";

/**
 * The campsite run with the two name conditions rejecting one row only
 * together (`together`): another copy of a stored campsite, or, with
 * `unaccounted`, a row the result does not hold. The read's counts name every
 * row it saw: 4 kept, 6 left out alone, 1 together.
 */
function summary(options: { unaccounted?: boolean } = {}): AutomationStudioRunResultSummary {
  const run = campsiteRunSummary();
  return {
    ...run,
    reads: run.reads!.map((read) => ({
      ...read,
      itemsSeen: 11,
      conditions: read.conditions!.map((condition) => (condition.number === 4 ? { ...condition, rejected: 3, alone: 0 } : condition.number === 5 ? { ...condition, rejected: 1, alone: 0 } : condition)),
      leftOutTogether: [{ conditions: [4, 5], rows: [options.unaccounted ? UNACCOUNTED : CAMP_BLUEWATER.name] }]
    }))
  };
}

/** The run, judged: each judge call answers the next diagnosis, its read named as a run of `subflows` names it. */
function judging(run: AutomationStudioRunResultSummary, ...diagnoses: Record<string, unknown>[]) {
  let calls = 0;
  let readId = CAMP_READ;
  const renamed = <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(CAMP_READ, readId)) as T;
  const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: renamed(diagnoses[calls++] ?? {}) }, usage: USAGE }) };
  const judge = automationStudioBuildTestJudge({ instructions: [campsiteInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });
  return async (subflows: ReadonlyArray<{ key: string; nodes: ReadonlyArray<{ key: string; definitionId: string }> }>): Promise<AutomationStudioBuildTestVerdict> => {
    const subflow = subflows.find((one) => one.nodes.some((node) => node.definitionId === "domain.demo.read_list"))!;
    readId = `node.bootstrap.0a1b2c3d.${subflow.key}.${subflow.nodes.find((node) => node.definitionId === "domain.demo.read_list")!.key}`;
    return judge({ summary: renamed(run), budget: { maxCostUsd: 0.2 } });
  };
}

/** The trial's answer as the candidate trial service gives it: the record beside the feedback. */
function answered(request: { revision: number; digest: string }, verdict: AutomationStudioBuildTestVerdict): AutomationStudioCandidateTrialResult {
  const base = { revision: request.revision, digest: request.digest };
  return { ...base, verdict: verdict.verdict === "no" ? "no" : verdict.verdict === "yes" ? "yes" : "unsure", feedback: { code: "candidate.trial_judged" }, ...("standingNo" in verdict && verdict.standingNo ? { standingNo: verdict.standingNo } : {}) } as AutomationStudioCandidateTrialResult;
}

function build(run: AutomationStudioRunResultSummary) {
  const controller = new AutomationStudioFlowCandidateSubmissionController(KEPT_CONDITION_SUBMISSION);
  const judge = judging(run, GAP_AND_CHANGE_NO, GAP_NO);
  const gate = new AutomationStudioFlowCandidateTrialGate({
    latest: () => controller.latest(),
    trial: { candidateId: "candidate.campsites", port: async (request) => answered(request, await judge(request.candidate.buildPlan.plan.subflows)) }
  });
  const history = { trialOf: (candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest">) => gate.standing(candidate), refuted: (digest: string) => gate.refuted(digest) };
  return { gate, submit: (input: JsonObject) => controller.submit(input, history), test: (candidate: AutomationStudioFlowCandidate) => gate.test({ revision: candidate.revision, digest: candidate.digest }) };
}

async function accepted(submitted: Promise<Awaited<ReturnType<AutomationStudioFlowCandidateSubmissionController["submit"]>>>): Promise<AutomationStudioFlowCandidate> {
  const result = await submitted;
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  return result.candidate;
}

describe("conditions that left a row out only together, through the judge, the gate and the controller (t666)", () => {
  it("are kept as one; dropping both is refused once in Core's words, dropping one never, and the same drop sent again is accepted", async () => {
    const { gate, submit, test } = build(summary());
    const exact = await accepted(submit(script([promoted, open, rating, campground, notCabin])));
    expect((await test(exact)).resultCode).toBe("candidate.trial_unsure");
    const kept = (gate.standing(exact) as { keptConditions?: Array<{ name: string; members?: unknown[] }> }).keptConditions ?? [];
    expect(kept.find((condition) => condition.members)?.name).toBe("condition 4 (name contains [\"Campground\"]) and condition 5 (name not contains [\"Cabin\"])");

    // Revision 7's move: both name conditions dropped.
    const dropped = await submit(script([promoted, open, rating]));
    expect(dropped.ok).toBe(false);
    if (dropped.ok) return;
    expect(dropped.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE]);
    const said = String(dropped.check.feedback?.instruction);
    expect(said).toContain(`left out together only this row: "${CAMP_BLUEWATER.name}" (another copy of it is in the result); no one of them left it out by itself, so keeping any one of them as written keeps it out.`);
    expect(said).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
    // Sent again: accepted.
    await accepted(submit(script([promoted, open, rating])));
  });

  it("is never refused for dropping one of them", async () => {
    const { submit, test } = build(summary());
    await test(await accepted(submit(script([promoted, open, rating, campground, notCabin]))));
    await accepted(submit(script([promoted, open, rating, campground])));
  });

  it("keeps nothing where Core cannot account for the row they left out together", async () => {
    const { gate, submit, test } = build(summary({ unaccounted: true }));
    const exact = await accepted(submit(script([promoted, open, rating, campground, notCabin])));
    await test(exact);
    const kept = (gate.standing(exact) as { keptConditions?: Array<{ members?: unknown[] }> }).keptConditions ?? [];
    expect(kept.some((condition) => condition.members)).toBe(false);
    await accepted(submit(script([promoted, open, rating])));
  });
});
