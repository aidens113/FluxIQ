// A trial's reads say how their paging ended, in the words the judges are
// shown (t498).
//
// Live run `run-mv6ff44s-01def7f6`, trial 1: one judge said no because "the
// read stopped after page 5 while the listing clearly continues", which Core's
// own read account -- the list ended, no page after page 5 -- contradicted. The
// judges were shown that account; the model was not, so it took the no's
// reading, invented a cause and chased it. Each read that paged now carries
// `pagesRead`, `stop` and the judges' `paging` sentence, and a split says that
// the account stands against a reading about pages.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES, type AutomationStudioResultReadAccount, type AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialFeedback } from "../index.ts";

const spent = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, calls: 2 };
const base = { nodeId: "read", definitionId: "web.output.dom-extract_list", truncated: false };
/** A read run as the passes of a loop that ended when the step moving the list on found no further page. */
const looped: AutomationStudioResultReadAccount = { ...base, pagesRead: 5, stop: "ended", paginates: true, itemsSeen: 60, kept: 15, keptPerPage: [4, 5, 4, 2, 0] };
/** A read its own page bound stopped. */
const bounded: AutomationStudioResultReadAccount = { ...base, nodeId: "bounded", pagesRead: 3, pageLimit: 3, stop: "page_limit", paginates: true, kept: 9 };
/** A read of one page that never pages. */
const single: AutomationStudioResultReadAccount = { ...base, nodeId: "single", pagesRead: 1, paginates: false, kept: 4 };

function summary(reads: AutomationStudioResultReadAccount[]): AutomationStudioRunResultSummary {
  return { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 15, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [], flowShape: [], withheld: false, reads };
}

const no = { expected: "Every listing on every page.", observed: "The read stopped after page 5 while the header says over 1,000 results." };
const yes = { expected: "The listings that meet the conditions.", observed: "Fifteen rows were stored." };

describe("the reads of a trial's feedback", () => {
  it("say how a looped read's paging ended, in the judges' own sentence, and a split weighs readings about pages against it", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.judged({
      verdict: { verdict: "unknown", why: "The two checks disagreed.", unconfirmedReading: no, answeredReading: yes, oneCallSaidYes: true, spent },
      summary: summary([looped]), trialRunId: "trial.1", start: "reset"
    });
    const [read] = feedback.reads as JsonObject[];
    expect(read).toMatchObject({ nodeId: "read", pagesRead: 5, stop: "ended" });
    expect(read!.paging).toBe("Read every page (5) and the list ended: the step that moves it on found no page after page 5. There is no further page.");
    expect(String(feedback.readings)).toContain("each read's paging is Core's own record of how its paging ended");
  });

  // t503 (`run-mv6lgqi6-4bfab2e1`, trial 3): an unsure about pages beside a yes, contradicted by the record.
  it("carry a judge call's doubt Core's paging record contradicts, and say to test the same revision again where the yes's evidence holds", () => {
    const doubtContradicted = "Judge call 1 could not tell, saying the list has pages its read never reached; Core's record says otherwise: Read read read every page (5) and the list ended.";
    const { verdict, feedback } = automationStudioCandidateTrialFeedback.judged({
      verdict: { verdict: "unknown", why: "The two checks disagreed.", answeredReading: yes, oneCallSaidYes: true, doubtContradicted, spent },
      summary: summary([looped]), trialRunId: "trial.3", start: "reset"
    });
    expect(verdict).toBe("unsure");
    expect(feedback).toMatchObject({ code: "candidate.trial_unconfirmed", doubtContradicted });
    expect(String(feedback.readings)).toContain("doubtContradicted is Core's record against the other call's doubt about pages");
    expect(String(feedback.readings)).toMatch(/test this same revision again/u);
  });

  it("say a read its page bound stopped was stopped by the bound, not the list", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.judged({ verdict: { verdict: "yes", spent }, summary: summary([bounded]), trialRunId: "trial.2", start: "reset" });
    const [read] = feedback.reads as JsonObject[];
    expect(read).toMatchObject({ pagesRead: 3, stop: "page_limit" });
    expect(String(read!.paging)).toContain("Its page bound stopped it at 3, not the list");
  });

  it("say it for a run that did not reach its end too, and say nothing of paging for a read that never pages", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", reads: [looped, single] });
    const [paged, once] = feedback.reads as JsonObject[];
    expect(paged).toMatchObject({ pagesRead: 5, stop: "ended", paging: expect.stringContaining("There is no further page.") });
    expect(once).not.toHaveProperty("paging");
    expect(once).not.toHaveProperty("pagesRead");
  });

  it("note once that the paging account stands, when any read carries one", () => {
    const judgedNo = automationStudioCandidateTrialFeedback.judged({
      verdict: { verdict: "no", expected: no.expected, observed: no.observed, findings: [], records: { stored: 15, refused: 0, missingRequired: 0 }, spent },
      summary: summary([looped]), trialRunId: "trial.3", start: "reset"
    });
    expect(String(judgedNo.feedback.pagingNote)).toContain("a judge's reading that says otherwise about pages is mistaken");
    const without = automationStudioCandidateTrialFeedback.judged({ verdict: { verdict: "yes", spent }, summary: summary([single]), trialRunId: "trial.4", start: "reset" });
    expect(without.feedback).not.toHaveProperty("pagingNote");
  });
});

// A trial's read of one part of a list that goes on says so, in plain words
// naming its step (F8). Live run `run-mveaaqxn-d0be9888`: a judged-no trial's
// read saw 5 items of a longer list and kept 1; the feedback carried the bare
// finding `result.counts_look_right` and nothing said the list went on, so
// three revisions repeated the same read of one part. The lists are made up.
const findingCodes = AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES;
const onePart: AutomationStudioResultReadAccount = { ...base, nodeId: "read.recipes", pagesRead: 1, paginates: false, itemsSeen: 5, kept: 1 };
const continuing: AutomationStudioResultReadAccount = { ...onePart, listContinues: { kind: "infinite_scroll", evidence: "declared_feed" } };

function judgedNoOn(reads: AutomationStudioResultReadAccount[], findings: string[]): JsonObject {
  return automationStudioCandidateTrialFeedback.judged({
    verdict: { verdict: "no", expected: "Every recipe of the archive's last week.", observed: "One recipe was stored.", findings, records: { stored: 1, refused: 0, missingRequired: 0 }, spent },
    summary: summary(reads), trialRunId: "trial.1", start: "reset"
  }).feedback;
}

describe("a trial's read of one part of a list that goes on", () => {
  it("says so on the read, names its step in a fix line, and drops the counts that were said to look right", () => {
    const feedback = judgedNoOn([continuing], [findingCodes.countsLookRight, findingCodes.summaryWithheld]);
    const [read] = feedback.reads as JsonObject[];
    expect(read!.listContinues).toBe("Step read.recipes read one part of a list that goes on past it (the page marks it as a list that loads more as it is scrolled): it saw 5 items and kept 1, and no item after those was read.");
    expect(feedback.findings).toEqual([findingCodes.readListContinues, findingCodes.summaryWithheld]);
    expect((feedback.fix as string[]).some((line) => line.startsWith("To read past what step read.recipes read,"))).toBe(true);
  });

  it("keeps the judge's own finding for it once, not twice", () => {
    const feedback = judgedNoOn([continuing], [findingCodes.readListContinues]);
    expect(feedback.findings).toEqual([findingCodes.readListContinues]);
    expect((feedback.fix as string[]).filter((line) => line.startsWith("To read past"))).toHaveLength(1);
  });

  it("leaves a read whose list ended as it was", () => {
    const feedback = judgedNoOn([onePart], [findingCodes.countsLookRight]);
    const [read] = feedback.reads as JsonObject[];
    expect("listContinues" in read!).toBe(false);
    expect(feedback.findings).toEqual([findingCodes.countsLookRight]);
    expect(feedback.fix).toBeUndefined();
  });

  it("says it under every verdict, since what the read saw is the trial's own fact", () => {
    const { feedback } = automationStudioCandidateTrialFeedback.judged({ verdict: { verdict: "yes", spent }, summary: summary([continuing]), trialRunId: "trial.2", start: "reset" });
    expect(String((feedback.reads as JsonObject[])[0]!.listContinues)).toContain("Step read.recipes read one part of a list that goes on past it");
  });
});
