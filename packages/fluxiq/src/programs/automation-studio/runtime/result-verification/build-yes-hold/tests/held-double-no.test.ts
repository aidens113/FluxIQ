// A playback's double no on the rows its build's two yeses judged (t660, A8
// frozen pair 6 candidate `run-mvac1av6-f7b0f9e2`) is recorded unverified, not
// refuted -- but only where Core's record contradicts at least part of each no
// (t664, A8 frozen pair 7 towels `run-mvahlxuu-760d9e28`, where the build's yes
// was the wrong side and the nos were right). Every double no records why it
// was or was not held. Driven end to end through the run's result check where
// the check reaches the rule, and against the hold itself for the weighing of
// each no. A hardware store's listing.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowInstructionDigest } from "../../../flow-version/index.ts";
import type { AutomationStudioResultVerificationOutcome } from "../../contracts/index.ts";
import type { AutomationStudioResultRecordSetInput } from "../../result-summary.ts";
import { ANSWER, datasetSummary, harness, instruction, verify, type Harness } from "../../tests/run-outcome-harness.ts";
import {
  AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES,
  AUTOMATION_STUDIO_RESULT_BUILD_YES_HOLD_BECAUSE,
  automationStudioResultBuildYesHold,
  automationStudioResultSameStoredRows,
  type AutomationStudioResultBuildYesHoldBecause,
  type AutomationStudioResultJudgedBuildTrial,
  type AutomationStudioResultJudgedBuildTrialMissing,
  type AutomationStudioResultWeighedNo
} from "../index.ts";

const REQUEST = instruction("List every cordless drill the hardware store sells itself, rated 4.5 or higher, with name and price.");
const DIGEST = automationStudioFlowInstructionDigest([REQUEST])!;
const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] };
const DRILLS: JsonObject[] = [{ name: "Ironbark 18V Cordless Drill", price: "$89.00" }, { name: "Millrace 12V Compact Drill", price: "$59.00" }];
const TRIAL_RUN = "trial.build-1";
const TRIAL: AutomationStudioResultJudgedBuildTrial = { trialRunId: TRIAL_RUN, verdict: "yes", calls: 2, instructionDigest: DIGEST };

type Named = AutomationStudioResultJudgedBuildTrial | AutomationStudioResultJudgedBuildTrialMissing | undefined;

/**
 * What each judge's no says, weighed by the real agreement (`../../agreement/`
 * `weighedNos`, t663). Refuted in part: a count Core's record contradicts (2
 * rows stored, not 5) beside a claim about a stored row Core cannot check.
 * Standing whole: that claim alone.
 */
const PART_REFUTED = { observed: "Only 5 rows were stored. The Millrace 12V Compact Drill is not sold by the hardware store itself." };
const STANDS_WHOLE = { observed: "The Millrace 12V Compact Drill is not sold by the hardware store itself." };

/** The run's result check with the build's trial named, each run's rows read from its own store. */
function checked(options: { trial?: Named; trialRows?: JsonObject[]; answer?: string; said?: Record<string, string> } = {}): Harness & { asked: number[] } {
  const context = harness({ answer: options.answer ?? ANSWER.no, said: options.said ?? PART_REFUTED, instructions: [REQUEST], schema: SCHEMA, rows: DRILLS });
  const asked: number[] = [];
  const stored: Record<string, JsonObject[]> = { "run-1": DRILLS, [TRIAL_RUN]: options.trialRows ?? DRILLS };
  const summary = (runId: string): AutomationStudioRunDatasetSummary => datasetSummary({ runId, datasetId: runId === TRIAL_RUN ? "trial-drills" : "drills", recordCount: stored[runId]!.length });
  context.ports.listRunDatasets = async ({ runId }) => [summary(runId)];
  context.ports.getRunDatasetPage = async ({ runId }) => ({ summary: summary(runId), schema: SCHEMA, rows: stored[runId]!.map((row) => ({ ...row })), nextCursor: null });
  context.ports.judgedBuildTrial = async (input) => {
    asked.push(input.flowVersions.length);
    return "trial" in options ? options.trial : TRIAL;
  };
  return Object.assign(context, { asked });
}

/** The record a run's result check wrote. */
const recorded = (next: { metadata?: JsonObject | undefined }) => next.metadata?.resultVerification as JsonObject;

/** A double no as the agreement records it, with each call's no weighed (`weighedNos`) where given. */
function doubleNo(weighedNos?: unknown, fields: Partial<AutomationStudioResultVerificationOutcome> = {}): AutomationStudioResultVerificationOutcome {
  return {
    schemaVersion: "automation-studio.result-verification.v1", performed: true, verdict: "does_not_answer", basis: "model",
    code: "core.result.does_not_answer_request", reason: "Judged twice not to answer.", observation: "2 records stored.",
    verdicts: ["does_not_answer", "does_not_answer"], calls: 2,
    repair: { schemaVersion: "automation-studio.result-repair-directive.v1", findings: [], fix: [], judgement: { observed: "The rating step left out the Ironbark 14V Drill." } },
    failure: { code: "core.result.does_not_answer_request", stage: "verification", message: "Judged twice not to answer." },
    ...(weighedNos !== undefined ? { weighedNos } : {}),
    ...fields
  } as AutomationStudioResultVerificationOutcome;
}

const SETS: AutomationStudioResultRecordSetInput[] = [{ summary: datasetSummary({ recordCount: DRILLS.length }), schema: SCHEMA, rows: DRILLS }];

/** The hold itself, with the build's confirmed yes on these very rows. */
async function held(outcome: AutomationStudioResultVerificationOutcome) {
  return await automationStudioResultBuildYesHold({ outcome, runId: "run-1", instructionDigest: DIGEST, recordSets: SETS, trial: async () => TRIAL, trialRecordSets: async () => SETS });
}

const part = (call: 1 | 2): AutomationStudioResultWeighedNo => ({ call, recordContradicts: "part" });

describe("a playback's double no beside its build's two yeses, through the run's result check", () => {
  it("is held, unverified and never a yes, where Core's record contradicts part of each no on the trial's very rows", async () => {
    // The t660 case: a first-ask two-call yes, the same request, the very same rows, and two nos Core refutes in part.
    const context = checked();
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    expect(recorded(next)).toMatchObject({
      status: "unverified", verdict: "unsure", basis: "model_disagreed", code: AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES,
      verdicts: ["does_not_answer", "does_not_answer"], buildYesHold: { held: true, because: "held" }
    });
    expect(recorded(next).repair).toBeUndefined();
    expect(context.saved.at(-1)?.metadata?.resultVerificationFailure).toBeUndefined();
    expect(context.asked).toHaveLength(1);
  });

  it("is refuted, never held, where a no stands whole against Core's record, though the trial matched in every other way", async () => {
    // The towels case (`run-mvahlxuu-760d9e28`): the nos named a kept row, and nothing in Core's record contradicts them.
    const next = await verify(checked({ said: STANDS_WHOLE }));
    expect(next.status).toBe("failed");
    expect(recorded(next)).toMatchObject({ status: "refuted", verdict: "does_not_answer", basis: "model", buildYesHold: { held: false, because: "no_stands_whole" } });
  });

  it("is refuted where the playback's rows differ from the trial's, and says so", async () => {
    const next = await verify(checked({ trialRows: [DRILLS[0]!, { name: "Ironbark 18V Cordless Drill Kit", price: "$119.00" }] }));
    expect(next.status).toBe("failed");
    expect(recorded(next)).toMatchObject({ status: "refuted", code: "core.result.does_not_answer_request", buildYesHold: { held: false, because: "rows_differ" } });
  });

  it("names the precondition that failed: no trial, another revision, no confirmed yes, or another request", async () => {
    const cases: Array<[Named, AutomationStudioResultBuildYesHoldBecause]> = [
      [undefined, "no_build_trial"],
      [{ missing: "no_build_trial" }, "no_build_trial"],
      [{ missing: "revision_mismatch" }, "revision_mismatch"],
      [{ ...TRIAL, trialRunId: "run-1" }, "no_build_trial"],
      [{ ...TRIAL, calls: 1 }, "trial_not_confirmed"],
      [{ ...TRIAL, calls: 4 }, "trial_not_confirmed"],
      [{ ...TRIAL, verdict: "unsure" }, "trial_not_confirmed"],
      [{ ...TRIAL, instructionDigest: "another" }, "request_differs"]
    ];
    for (const [trial, because] of cases) {
      const next = await verify(checked({ trial }));
      expect(next.status).toBe("failed");
      expect(recorded(next)).toMatchObject({ status: "refuted", buildYesHold: { held: false, because } });
    }
  });

  it("says no trial where the caller names none at all", async () => {
    const context = checked();
    delete context.ports.judgedBuildTrial;
    expect(recorded(await verify(context))).toMatchObject({ status: "refuted", buildYesHold: { held: false, because: "no_build_trial" } });
  });

  it("never makes a yes, and is neither asked nor recorded for a result the judges did not refute", async () => {
    const context = checked({ answer: ANSWER.yes });
    const next = await verify(context);
    expect(recorded(next)).toMatchObject({ status: "confirmed", verdict: "answers" });
    expect(recorded(next).buildYesHold).toBeUndefined();
    expect(context.asked).toHaveLength(0);
  });
});

describe("the hold, by what Core's record says of each no", () => {
  it("holds the t660 double no, where Core's record contradicts part of each no: unverified, with no repair, never a yes", async () => {
    const { outcome, hold } = await held(doubleNo([part(1), part(2)]));
    expect(hold).toEqual({ held: true, because: "held" });
    expect(outcome).toMatchObject({ performed: true, verdict: "unsure", basis: "model_disagreed", code: AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES, verdicts: ["does_not_answer", "does_not_answer"], calls: 2 });
    expect(outcome.performed === true && outcome.unconfirmedReading).toEqual({ observed: "The rating step left out the Ironbark 14V Drill." });
    expect(outcome.performed === true && (outcome.repair ?? outcome.failure)).toBeUndefined();
  });

  it("never holds to a trial yes reached by asking again calls that first said otherwise; a first-ask two-call yes still holds", async () => {
    // The debugged towels trial: two nos Core refuted, each asked again, then two yeses -- four calls. A contradicted unsure asked again, or a split's no, is three.
    const weighed = doubleNo([part(1), part(2)]);
    for (const calls of [3, 4]) {
      const result = await automationStudioResultBuildYesHold({ outcome: weighed, runId: "run-1", instructionDigest: DIGEST, recordSets: SETS, trial: async () => ({ ...TRIAL, calls }), trialRecordSets: async () => SETS });
      expect(result).toEqual({ outcome: weighed, hold: { held: false, because: "trial_not_confirmed" } });
    }
    expect((await held(weighed)).hold).toEqual({ held: true, because: "held" });
  });

  it("holds where one no is wholly contradicted and the other in part", async () => {
    expect((await held(doubleNo([{ call: 1, recordContradicts: "whole" }, part(2)]))).hold).toEqual({ held: true, because: "held" });
  });

  it("never sets aside a no that stands whole: the double no is returned exactly as it came", async () => {
    for (const weighed of [[part(1), { call: 2 }], [{ call: 1 }, { call: 2 }], [part(1)], [{ call: 2, recordContradicts: "part" }]]) {
      const outcome = doubleNo(weighed);
      const result = await held(outcome);
      expect(result.hold).toEqual({ held: false, because: "no_stands_whole" });
      expect(result.outcome).toBe(outcome);
    }
  });

  it("leaves a double no with no weighedNos refuted, saying nos_not_weighed", async () => {
    // The agreement weighs nos only where it holds Core's record of the result; an outcome without one is never set aside.
    const unweighed = doubleNo(undefined);
    expect(unweighed).not.toHaveProperty("weighedNos");
    const result = await held(unweighed);
    expect(result).toEqual({ outcome: unweighed, hold: { held: false, because: "nos_not_weighed" } });
    expect(result.outcome).toMatchObject({ verdict: "does_not_answer", basis: "model", failure: { code: "core.result.does_not_answer_request" } });
  });

  it("reads a malformed weighing as unweighed, never as refuted", async () => {
    for (const weighed of [[], [{ call: 3, recordContradicts: "part" }], [{ call: 1, recordContradicts: "most" }, part(2)], "part"]) {
      const result = await held(doubleNo(weighed));
      expect(result.hold).toEqual({ held: false, because: "nos_not_weighed" });
    }
  });

  it("is not asked about a double no Core's own arithmetic reached, nor about a single no", async () => {
    let asked = 0;
    const trial = async () => {
      asked += 1;
      return TRIAL;
    };
    for (const outcome of [doubleNo([part(1), part(2)], { basis: "core_observation" }), doubleNo([part(1), part(2)], { verdicts: ["does_not_answer"], calls: 1 })]) {
      const result = await automationStudioResultBuildYesHold({ outcome, runId: "run-1", instructionDigest: DIGEST, recordSets: SETS, trial, trialRecordSets: async () => SETS });
      expect(result).toEqual({ outcome });
    }
    expect(asked).toBe(0);
  });

  it("has exactly the closed codes the cases above record", () => {
    expect([...AUTOMATION_STUDIO_RESULT_BUILD_YES_HOLD_BECAUSE].sort()).toEqual(["held", "no_build_trial", "no_stands_whole", "nos_not_weighed", "request_differs", "revision_mismatch", "rows_differ", "trial_not_confirmed"]);
  });
});

describe("two runs' stored rows, by content", () => {
  const set = (rows: JsonObject[], fields: Partial<AutomationStudioRunDatasetSummary> = {}) => ({ summary: datasetSummary({ recordCount: rows.length, ...fields }), schema: SCHEMA, rows });

  it("are the same with the same fields and rows in the same order, whatever the dataset's id or a row's key order", () => {
    expect(automationStudioResultSameStoredRows([set(DRILLS)], [set(DRILLS.map((row) => ({ price: row.price!, name: row.name! })), { datasetId: "other" })])).toBe(true);
  });

  it("are not where the order, a value or the count differs, a set was cut, or neither holds a row", () => {
    expect(automationStudioResultSameStoredRows([set(DRILLS)], [set([...DRILLS].reverse())])).toBe(false);
    expect(automationStudioResultSameStoredRows([set(DRILLS)], [set([DRILLS[0]!])])).toBe(false);
    expect(automationStudioResultSameStoredRows([set(DRILLS)], [set(DRILLS, { truncated: true })])).toBe(false);
    expect(automationStudioResultSameStoredRows([set([])], [set([])])).toBe(false);
  });
});
