// A stub-judge replay of A8 frozen pair 5 candidate towels
// `run-mva6mlo8-f519063c` (t652, trials 5-7): an exact revision was judged a
// split, one yes and one no, so before t652 no record of Core's reached the
// gate, and the next revision dropped, unchallenged, a condition whose every
// row left out by itself Core had settled on the request's own words. On the
// hardware store's drill search of
// `../../../../../result-verification/refuted-no/tests/hardware-fixture.ts`, through
// the whole-candidate submission controller and trial gate: revision 1 is
// judged yes and no; its delivery condition left out, by itself, only a drill
// Core read as "Delivery in 6 days", which fails the request's words, so the
// gate keeps it; the next revision drops it and is refused once
// (`candidate.kept_condition_dropped`, a hint, never a block); the identical
// resend is accepted. Its seller condition tests each row's own name (t651), so
// the rows it left out are not Core's to account for: it is not kept, and a
// revision dropping it is never refused. No model is called; the provider is
// scripted. No task, site, item or answer of any realistic scenario.
//
// The port answers as the candidate trial service
// (`../../../../../service/candidate-trial/run.ts`) does once it hands the gate an
// unknown's record beside the feedback, as it hands a no's (t652).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider } from "../../../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestVerdict, type AutomationStudioRunResultSummary } from "../../../../../result-verification/index.ts";
import { DRILL_PRO, DRILL_READ, DRILL_SLOW, HOUSE, SELLER_IS_TITLE, hardwareInstruction, hardwareRunSummary } from "../../../../../result-verification/refuted-no/tests/hardware-fixture.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE,
  AutomationStudioFlowCandidateSubmissionController,
  AutomationStudioFlowCandidateTrialGate,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioFlowCandidate
} from "../../../index.ts";
import { KEPT_CONDITION_SUBMISSION } from "./kept-condition-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const READ_LIST_ID = "domain.demo.read_list";

/** The read's three conditions, as the exact revision writes them, in the account's order. */
const DELIVERY = { field: "delivery", contains: "Delivery tomorrow" };
const RATING = { field: "rating", atLeast: 4 };
const SELLER = { field: "seller", startsWith: HOUSE };

/** The delivery condition as the account words it, without Core's aside. */
const DELIVERY_SAID = "delivery (read \"Delivery tomorrow\" on a row it kept) contains [\"Delivery tomorrow\"]";

/** Call 1: the yes, each condition that left a row out held to the request's own words. */
const YES = {
  answersRequest: "yes",
  observed: `Condition 1 (${DELIVERY_SAID}) follows "ready for delivery tomorrow". Condition 2 (rating atLeast 4) follows "rated 4 or higher". Condition 3 (${SELLER_IS_TITLE}) follows "that ${HOUSE} sells itself rather than a marketplace seller". The 2 stored drills meet all three.`
};

/** Call 2: a no Core's record does not settle, naming nothing about the delivery condition. */
const NO = {
  answersRequest: "no", defects: [],
  expected: `Every cordless drill ${HOUSE} sells itself, ready for delivery tomorrow and rated 4 or higher, each once.`,
  observed: `The rating value of ${DRILL_PRO.name} is not included.`,
  changed: "Store each drill's rating as shown on the page."
};

/** A script of one list read with these conditions. */
function script(where: readonly JsonObject[]): JsonObject {
  const readList = { fields: { name: "name", price: "price", rating: "rating", delivery: "delivery", seller: "seller" }, where, paginate: { pages: 5 } };
  return { summary: "Drills", flow: ["flow: Cordless drills for delivery tomorrow", "step: read the drills", `  node: ${READ_LIST_ID}`, `  readList: ${JSON.stringify(readList)}`].join("\n") };
}

/** The read's node id in a run: its subflow's and its step's keys, as a bootstrap Flow names it. */
function readIdOf(subflows: ReadonlyArray<{ key: string; nodes: ReadonlyArray<{ key: string; definitionId: string }> }>): string {
  const subflow = subflows.find((one) => one.nodes.some((node) => node.definitionId === READ_LIST_ID))!;
  const read = subflow.nodes.find((node) => node.definitionId === READ_LIST_ID)!;
  return `node.bootstrap.0a1b2c3d.${subflow.key}.${read.key}`;
}

/** Each trial of the exact rows' run, judged by the build-test judge: call 1 yes, call 2 no, and the split's no asked again (t725) no again, and so on. */
function judging(...diagnoses: Record<string, unknown>[]) {
  let calls = 0;
  const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: diagnoses[calls++ % diagnoses.length] ?? {} }, usage: USAGE }) };
  const judge = automationStudioBuildTestJudge({ instructions: [hardwareInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });
  return async (subflows: Parameters<typeof readIdOf>[0]): Promise<AutomationStudioBuildTestVerdict> => {
    const summary = JSON.parse(JSON.stringify(hardwareRunSummary()).replaceAll(DRILL_READ, readIdOf(subflows))) as AutomationStudioRunResultSummary;
    return judge({ summary, budget: { maxCostUsd: 0.2 } });
  };
}

/** The trial's answer as the service gives it: an unknown is unsure, its record beside the feedback (header). */
function answered(request: { revision: number; digest: string }, verdict: AutomationStudioBuildTestVerdict): AutomationStudioCandidateTrialResult {
  const base = { revision: request.revision, digest: request.digest };
  if (verdict.verdict === "unknown") {
    const feedback = { code: "candidate.trial_unconfirmed", ...(verdict.unconfirmedReading ? { unconfirmedReading: { ...verdict.unconfirmedReading } } : {}) } as JsonObject;
    return { ...base, verdict: "unsure", feedback, ...(verdict.standingNo ? { standingNo: verdict.standingNo } : {}) } as AutomationStudioCandidateTrialResult;
  }
  return { ...base, verdict: verdict.verdict === "yes" ? "yes" : verdict.verdict === "no" ? "no" : "not_judged", feedback: { code: `candidate.trial_${verdict.verdict}` } };
}

function build() {
  const controller = new AutomationStudioFlowCandidateSubmissionController(KEPT_CONDITION_SUBMISSION);
  const judge = judging(YES, NO, NO, NO);
  const gate = new AutomationStudioFlowCandidateTrialGate({
    latest: () => controller.latest(),
    trial: { candidateId: "candidate.drills", port: async (request) => answered(request, await judge(request.candidate.buildPlan.plan.subflows)) }
  });
  const history = { trialOf: (candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest">) => gate.standing(candidate), refuted: (digest: string) => gate.refuted(digest) };
  const submit = (input: JsonObject) => controller.submit(input, history);
  const test = (candidate: AutomationStudioFlowCandidate) => gate.test({ revision: candidate.revision, digest: candidate.digest });
  return { controller, gate, submit, test };
}

async function accepted(submitted: ReturnType<ReturnType<typeof build>["submit"]>): Promise<AutomationStudioFlowCandidate> {
  const result = await submitted;
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  return result.candidate;
}

describe("a condition Core's record vindicated in a split trial (t652)", () => {
  it("is kept from the unsure trial, its drop refused once with the resend hint, and the identical resend accepted", async () => {
    const { controller, gate, submit, test } = build();
    const exact = await accepted(submit(script([DELIVERY, RATING, SELLER])));
    const trial = await test(exact);
    expect(trial.resultCode).toBe("candidate.trial_unsure");
    // The record rides outside the feedback a model is shown.
    expect(JSON.stringify(trial.evidence)).not.toContain("keptConditions");
    expect(JSON.stringify(trial.evidence)).not.toContain("standingNo");
    const kept = gate.standing(exact) as (AutomationStudioCandidateTrialResult & { keptConditions?: Array<{ name: string; revision: number; keptOut: unknown[] }> }) | undefined;
    // Only the delivery condition: the seller condition's rows are a label test, never Core's to account for (t651).
    expect(kept?.keptConditions?.map((condition) => condition.name)).toEqual([`condition 1 (${DELIVERY_SAID})`]);
    expect(kept?.keptConditions?.[0]?.keptOut).toEqual([{ label: DRILL_SLOW, by: "request_words", texts: ["Delivery tomorrow"] }]);

    // The next revision drops the delivery condition: refused once.
    const dropped = await submit(script([RATING, SELLER]));
    expect(dropped.ok).toBe(false);
    if (dropped.ok) return;
    expect(dropped.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE]);
    // The mark the repeat guard reads (t650): the identical resend is let through once.
    expect(dropped.check.feedback).toMatchObject({ code: AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE, resend: "accepted_once" });
    const said = String(dropped.check.feedback?.instruction);
    expect(said).toContain("Condition 1 (delivery");
    expect(said).toContain("fails the request's words");
    expect(said).toContain("submit the same change again: Core refuses this once, not twice");
    expect(said).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
    expect(controller.matches(exact)).toBe(true);

    // The same drop sent again: accepted.
    const again = await accepted(submit(script([RATING, SELLER])));
    expect(again.revision).toBe(3);
  });

  it("does not keep a condition whose left-out rows Core's record does not account for: dropping it is never refused", async () => {
    const { submit, test } = build();
    await test(await accepted(submit(script([DELIVERY, RATING, SELLER]))));
    await accepted(submit(script([DELIVERY, RATING])));
  });
});
