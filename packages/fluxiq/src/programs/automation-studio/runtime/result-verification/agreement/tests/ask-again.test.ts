// What the second call of a verification asks (t691, `../ask-again.ts`): a
// confirming check asks the converse of a first yes -- each stored row, record
// set by record set, with the read that stored it, against the request's words
// that ask for it -- never the same question repeated at temperature 0 (A8
// `run-mvbr0w7e-6a01c05b`, steps 0032-0033: byte-identical requests, one
// opinion counted twice).
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { RENEWALS_ACT_READ, RENEWALS_KEPT, RENEWALS_LEFT_OUT, RENEWALS_LIST_READ, renewalsRunSummary } from "../../request-rows/tests/renewals-fixture.ts";
import { automationStudioResultVerificationAskAgain, automationStudioResultVerificationConfirmingAsk } from "../ask-again.ts";

const base = { schemaVersion: "automation-studio.result-verification.v1", code: "core.result.answers_request", reason: "Judged.", observation: "12 records stored." } as const;
const YES: AutomationStudioResultVerification = { ...base, verdict: "answers", basis: "model" };
const NO: AutomationStudioResultVerification = { ...base, verdict: "does_not_answer", basis: "model" };
const UNSURE: AutomationStudioResultVerification = { ...base, verdict: "unsure", basis: "model" };
const SILENT: AutomationStudioResultVerification = { ...base, verdict: "unsure", basis: "model_unavailable" };
const HELD_YES: AutomationStudioResultVerification = { ...base, verdict: "unsure", basis: "model_unconfirmed", exclusionEvidenceMissing: ["a line"], yesUnconfirmed: true };

/** The converse a confirming check asks of a first yes over `summary`. */
const converse = (summary: AutomationStudioRunResultSummary = renewalsRunSummary()): string => automationStudioResultVerificationConfirmingAsk(YES, summary, { confirmAnswer: true }) ?? "";

describe("the second call that confirms a first yes", () => {
  it("asks the converse question: each stored row, by record set and the read that stored it, against the request's words", () => {
    const question = converse();
    expect(question).toContain("asking the converse question, not the same one");
    expect(question).toContain("for each say whether the request asks for that row in its answer");
    const [, listed, narrowed] = question.split("\n");
    expect(listed).toContain(`renewed-loans-s14, stored by read ${RENEWALS_LIST_READ}, 8 rows: `);
    for (const [title] of [...RENEWALS_KEPT, ...RENEWALS_LEFT_OUT]) expect(listed).toContain(title);
    expect(narrowed).toContain(`overdue-loans-s8, stored by read ${RENEWALS_ACT_READ}, 4 rows: `);
  });

  it("counts the rows a set holds that the summary does not show", () => {
    const summary = renewalsRunSummary();
    summary.recordSets[0]!.recordCount = 20;
    expect(converse(summary)).toContain("20 rows, 12 not shown here: ");
  });

  it("leaves out a record set only a subflow trial's entry collected", () => {
    const summary = renewalsRunSummary();
    summary.taskChecklist = { supplementary: "", asked: [], notAsked: [], entry: { subflows: ["find_overdue"], steps: [RENEWALS_ACT_READ] } };
    expect(converse(summary)).not.toContain("overdue-loans-s8");
  });

  it("asks the same of a result's acts where it stores no row", () => {
    const question = converse({ ...renewalsRunSummary(), recordSets: [] });
    expect(question).toContain("The result stores no row.");
    expect(question).toContain("for each say whether the request asks for that act");
  });

  it("asks it of a yes Core held for the evidence it lacked: that is still the model's yes", () => {
    expect(automationStudioResultVerificationConfirmingAsk(HELD_YES, renewalsRunSummary(), { confirmAnswer: true })).toContain("converse question");
  });

  it("asks nothing new of a first answer that is no yes, of a runtime check, or where no second call is made", () => {
    for (const first of [NO, UNSURE, SILENT]) expect(automationStudioResultVerificationConfirmingAsk(first, renewalsRunSummary(), { confirmAnswer: true })).toBeUndefined();
    expect(automationStudioResultVerificationConfirmingAsk(YES, renewalsRunSummary())).toBeUndefined();
    expect(automationStudioResultVerificationConfirmingAsk(YES, renewalsRunSummary(), { confirmAnswer: false })).toBeUndefined();
  });

  it("leaves whether a second call is made as it was", () => {
    expect(automationStudioResultVerificationAskAgain(YES, { confirmAnswer: true })).toBe(true);
    expect(automationStudioResultVerificationAskAgain(YES)).toBe(false);
    expect(automationStudioResultVerificationAskAgain(NO)).toBe(true);
    expect(automationStudioResultVerificationAskAgain(SILENT, { confirmAnswer: true })).toBe(false);
    expect(automationStudioResultVerificationAskAgain(HELD_YES)).toBe(true);
  });
});
