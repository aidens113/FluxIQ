// Every code a result check can write, and where a run on it goes.
//
// The re-author route once compared one code, so a no Core reached itself went to
// a ladder that cannot add a step (run-mw0jw263-0251c104). This holds the route's
// list to the codes actually written: a new code in `result-verification` fails
// here until it has a place, and each route's codes are made by their real writers.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioResultComputedNo } from "../../../../result-verification/computed-facts/index.ts";
import { automationStudioResultCoreObservation, automationStudioResultVerificationFailsRun, type AutomationStudioResultVerification, type AutomationStudioResultVerificationOutcome, type AutomationStudioRunResultSummary } from "../../../../result-verification/index.ts";
import { automationStudioResultRequestedOutputHeld } from "../../../../result-verification/requested-output/index.ts";
import { automationStudioResultSiteChangeHeld } from "../../../../result-verification/site-change/index.ts";
import { automationStudioResultVerdict } from "../../../../result-verification/verdict/index.ts";
import { automationStudioRefutedResultAttempt } from "../attempt.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY } from "../history.ts";
import { automationStudioReauthorBrief } from "../brief.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_CODES, automationStudioRefutedResultReauthorDecision } from "../reauthor.ts";
import { repairAutomationStudioRefutedRunResult, type AutomationStudioRefutedResultRepairPort } from "../repair.ts";

/** Nothing judged it, or nobody could: a repair would change a Flow on no evidence, so none is built. The run fails. */
const FAILS_THE_RUN_UNREPAIRED = [
  "core.result.verdict_absent",
  "core.result.verdict_unavailable",
  "core.result.unreadable"
];
/**
 * The first of a pair of calls, never a run's last word: a model-basis `unsure` is
 * always asked again (`agreement/ask-again.ts`), and two calls settle as one of the
 * unverified codes below.
 */
const ASKED_AGAIN = [
  "core.result.verdict_unsure"
];
/** Judged, and the judges did not settle it, or Core did not take a yes. Recorded unverified: the run keeps its status, and nothing fails to repair. */
const UNVERIFIED = [
  "core.result.verdicts_disagree",
  "core.result.refutation_unconfirmed",
  "core.result.refutation_contradicted",
  "core.result.refutation_unsupported",
  "core.result.exclusion_evidence_missing",
  "core.result.change_not_proven",
  "core.result.build_yes_disagrees",
  "core.result.yes_citation_refuted"
];
/** A yes, of some kind. `answers_with_change_advised` is also what an unconfirmed yes that advised a change carries. */
const ANSWERS = [
  "core.result.answers_request",
  "core.result.answers_with_change_advised",
  "core.result.no_refuted_by_record"
];
/** Not a verdict: the question was never put. */
const NOT_JUDGED = [
  "core.result.no_model_available",
  "core.result.verification_did_not_finish"
];
/** Nothing writes these any more; a stored run may carry them, and comments name them (`verify.ts`). */
const HISTORICAL = [
  "core.result.nothing_to_judge",
  "core.result.no_records"
];

const RESULT_VERIFICATION = fileURLToPath(new URL("../../../../result-verification/", import.meta.url));

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === "tests" ? [] : sources(path.join(directory, entry.name));
    return entry.name.endsWith(".ts") ? [path.join(directory, entry.name)] : [];
  });
}

const refused: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 0, totalRefusedCount: 4, totalRowsMissingRequired: 0, recordSetCount: 1,
  recordSets: [{ datasetId: "dataset.1", recordCount: 0, refusedCount: 4, truncated: false, columns: [], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [] }],
  flowShape: [{ nodeId: "read", definitionId: "web.output.read" }],
  withheld: false
};
const missingValues: AutomationStudioRunResultSummary = {
  ...refused,
  totalRecordCount: 2, totalRefusedCount: 0, totalRowsMissingRequired: 2,
  recordSets: [{ ...refused.recordSets[0]!, recordCount: 2, refusedCount: 0, columns: ["title"], rowsChecked: 2, rowsMissingRequired: 2, missingRequiredColumns: ["title"], sampleRows: [{ title: "" }] }]
};
const stored: AutomationStudioRunResultSummary = {
  ...refused,
  totalRecordCount: 2, totalRefusedCount: 0,
  recordSets: [{ ...refused.recordSets[0]!, recordCount: 2, refusedCount: 0, columns: ["title"], rowsChecked: 2, sampleRows: [{ title: "Oak table" }] }]
};
const empty: AutomationStudioRunResultSummary = { ...refused, totalRefusedCount: 0, recordSetCount: 0, recordSets: [] };

const judged = (verification: AutomationStudioResultVerification): AutomationStudioResultVerificationOutcome => ({ ...verification, performed: true });
/** Only what each verdict reads: its basis, the summary, and what the call answered. */
const verdictOf = (input: { basis: string; summary: AutomationStudioRunResultSummary; diagnosis?: { answersRequest: string }; failureCode?: string }) => automationStudioResultVerdict(input as unknown as Parameters<typeof automationStudioResultVerdict>[0]);
const yes = verdictOf({ basis: "model", summary: stored, diagnosis: { answersRequest: "yes" } });
const owedRecords = { parts: [{ part: "listing", columns: ["title"] }] };

/** Each code the re-author takes, as its real writer writes it. */
function written(): Array<[string, AutomationStudioResultVerification]> {
  return [
    ["a judge's no", verdictOf({ basis: "model", summary: stored, diagnosis: { answersRequest: "no" } })],
    ["a no Core's facts reached", automationStudioResultComputedNo(stored, [{ kind: "count", status: "fails", said: "Core counted the rows.", defects: [] }] as unknown as Parameters<typeof automationStudioResultComputedNo>[1])],
    ["every row refused", automationStudioResultCoreObservation(refused)!],
    ["required values missing", automationStudioResultCoreObservation(missingValues)!],
    ["records owed and none stored", automationStudioResultRequestedOutputHeld({ ...yes, verdicts: ["answers"], calls: 1 }, empty, owedRecords)]
  ];
}

const detailOf = (code: string) => ({
  summary: { runId: "run.one", status: "failed" },
  actionAttempts: [{ attemptId: "a.1", nodeId: "read", definitionId: "web.output.read", order: 1, status: "succeeded", startedAt: 1, metadata: { recordCount: 2 } }],
  metadata: { [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, attempts: 1, code } }
}) as unknown as AutomationStudioFlowRunDetail;

describe("every code the result check can write", () => {
  it("has exactly one place, and the places name only codes that exist", () => {
    const places = [...AUTOMATION_STUDIO_RESULT_REAUTHOR_CODES, ...FAILS_THE_RUN_UNREPAIRED, ...ASKED_AGAIN, ...UNVERIFIED, ...ANSWERS, ...NOT_JUDGED, ...HISTORICAL];
    expect(new Set(places).size).toBe(places.length);
    const inSource = new Set(sources(RESULT_VERIFICATION).flatMap((file) => readFileSync(file, "utf8").match(/core\.result\.[a-z_]+/gu) ?? []));
    expect([...inSource].sort()).toEqual([...places].sort());
  });

  it("writes a no only where this test makes one: a new writer of the verdict must be routed", () => {
    const writers = sources(RESULT_VERIFICATION).filter((file) => /verdict: "does_not_answer"|failed\("does_not_answer"|failed\(verdict, "model", codes\.doesNotAnswer/u.test(readFileSync(file, "utf8")));
    expect(writers.map((file) => path.relative(RESULT_VERIFICATION, file).replace(/\\/gu, "/")).sort()).toEqual(["computed-facts/computed-no.ts", "core-observation.ts", "verdict/result-verdict.ts"]);
  });
});

describe("the re-author route", () => {
  const route = { projectId: "project.one", flowId: "flow.one" };

  it("takes every code it lists, each as its real writer writes it, and each has an attempt to repair", () => {
    const codes = written().map(([, verification]) => verification.code);
    expect([...codes].sort()).toEqual([...AUTOMATION_STUDIO_RESULT_REAUTHOR_CODES].sort());
    for (const [, verification] of written()) {
      expect(automationStudioResultVerificationFailsRun(verification)).toBe(true);
      expect(automationStudioRefutedResultReauthorDecision({ detail: detailOf(verification.code), ...route })).toEqual({ route: true, ...route });
      expect(automationStudioRefutedResultAttempt({ runId: "run.one", detail: detailOf(verification.code), outcome: judged(verification), now: 2 })).toBeDefined();
    }
  });

  it("refuses everything else, so nothing else is paid for", () => {
    for (const code of [...FAILS_THE_RUN_UNREPAIRED, ...ASKED_AGAIN, ...UNVERIFIED, ...ANSWERS, ...NOT_JUDGED, ...HISTORICAL]) {
      expect(automationStudioRefutedResultReauthorDecision({ detail: detailOf(code), ...route })).toEqual({ route: false, refusal: "not_a_wrong_answer" });
    }
  });
});

describe("a yes Core held because the records owed were never stored", () => {
  const held = automationStudioResultRequestedOutputHeld({ ...yes, verdicts: ["answers"], calls: 1 }, empty, owedRecords);
  const enter = async (outcome: AutomationStudioResultVerification) => {
    const repair = vi.fn(async (input: Parameters<AutomationStudioRefutedResultRepairPort>[0]) => input.detail);
    const result = await repairAutomationStudioRefutedRunResult({ runId: "run.one", detail: { ...detailOf(""), metadata: {} }, outcome: judged(outcome), summary: empty, now: 2, repair, saveFlowRunDetail: async () => undefined });
    return { repair, result };
  };

  it("enters the repair, under the same bound, and the build is told what Core found", async () => {
    const { repair, result } = await enter(held);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(result?.detail.metadata?.[AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]).toMatchObject({ attempted: true, attempts: 1, maxAttempts: 3, code: "core.result.requested_output_missing" });
    const brief = automationStudioReauthorBrief({ projectId: "project.one", flowId: "flow.one", current: result!.entry, history: [], maxAttempts: 3, now: 2 });
    expect(brief.body).toContain(held.requestedOutputMissing!.said);
  });

  it("is not what any other unsure comes to: a result nobody could judge enters no repair", async () => {
    const { repair, result } = await enter(verdictOf({ basis: "model_unavailable", summary: stored, failureCode: "llm.timeout" }));
    expect(repair).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});

describe("a code no repair is built from", () => {
  // The code the brief names as going to the ladder. It goes nowhere: Core did not take a yes,
  // the run keeps its status, and nothing is owed a repair. Fixing nothing here is the fix.
  it("change_not_proven: unverified, so the run does not fail, and no attempt enters the ladder or the build", () => {
    const held = automationStudioResultSiteChangeHeld(yes, { ...stored, siteChange: { proofs: [{ part: "add the item", effect: { kind: "change", direction: "adds" }, proof: "no_change" }], witnesses: [] } } as unknown as AutomationStudioRunResultSummary);
    expect(held).toMatchObject({ code: "core.result.change_not_proven", verdict: "unsure", basis: "model_unconfirmed" });
    expect(automationStudioResultVerificationFailsRun(held)).toBe(false);
    expect(automationStudioRefutedResultAttempt({ runId: "run.one", detail: detailOf(held.code), outcome: judged(held), now: 2 })).toBeUndefined();
  });

  it("a result nobody could judge fails the run and builds no attempt", () => {
    const unavailable = verdictOf({ basis: "model_unavailable", summary: stored, failureCode: "llm.timeout" });
    expect(unavailable.code).toBe("core.result.verdict_unavailable");
    expect(automationStudioResultVerificationFailsRun(unavailable)).toBe(true);
    expect(automationStudioRefutedResultAttempt({ runId: "run.one", detail: detailOf(unavailable.code), outcome: judged(unavailable), now: 2 })).toBeUndefined();
  });
});
