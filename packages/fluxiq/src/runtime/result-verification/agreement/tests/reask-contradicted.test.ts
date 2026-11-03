// The agreement's re-asks of a no take its place only where Core settled every
// reason it gave (t686, `../reask-contradicted.ts` over `../no-reasons.ts`): a
// split's no adding an exclusion the request never states (t515) and a no
// Core's record refutes (t607) each stand where they give a reason their
// recheck does not address and the record does not refute. A garden catalogue
// and a library catalogue: no task, site, item or answer of any realistic scenario.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioResultVerification } from "../../contracts/index.ts";
import { DROPPED_INCLUDING_NO, LIBRARY_YES, MISSING_LIST_NO } from "../../refuted-no/tests/library-readings-fixture.ts";
import { libraryRequestText, libraryRunSummary, libraryWording } from "../../refuted-no/tests/library-fixture.ts";
import { requestWordsRunSummary, requestWordsWording } from "../../request-rows/tests/request-words-fixture.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../index.ts";

describe("a split's no adding an exclusion the request never states (t515)", () => {
  const ADVICE = "Add a condition to the read that excludes replacement parts such as the Replacement Handle row.";
  const noSaying = (observed: string): AutomationStudioResultVerification => automationStudioResultVerdict({
    summary: requestWordsRunSummary(), basis: "model", diagnosis: { answersRequest: "no", expected: "Only garden tools.", observed, changed: ADVICE }
  });
  const yes = automationStudioResultVerdict({ summary: requestWordsRunSummary(), basis: "model", diagnosis: { answersRequest: "yes", observed: "Every in-stock result is there." } });

  async function reasked(no: AutomationStudioResultVerification) {
    const input = { first: yes, second: no, confirmAnswer: true, wording: requestWordsWording() };
    const ask = vi.fn(async (_recheck: string, _call: 1 | 2) => yes);
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled: automationStudioResultVerificationAgreement(input), ask });
    return { ask, outcome };
  }

  it("is asked once more where its one reason is a kept row the recheck addresses", async () => {
    const { ask, outcome } = await reasked(noSaying("A replacement handle was stored."));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ verdict: "answers", calls: 3 });
  });

  it("stands where it also gives a reason the recheck does not address: rows missing, or a row left out", async () => {
    for (const observed of ["A replacement handle was stored, and two in-stock trowels are missing.", "A row that is not a tool was left out."]) {
      const { ask, outcome } = await reasked(noSaying(observed));
      expect(ask).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", calls: 2 });
    }
  });
});

describe("a no Core's record refutes (t607)", () => {
  const summary = libraryRunSummary();
  const input = (first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) =>
    ({ first, second, confirmAnswer: true, reads: summary.reads, recordSets: summary.recordSets, wording: libraryWording(summary), summary, requestText: libraryRequestText() });
  const judged = (diagnosis: Record<string, string>): AutomationStudioResultVerification =>
    automationStudioResultVerdict({ summary, wording: libraryWording(summary), diagnosis: { ...diagnosis, answersRequest: diagnosis.answersRequest === "yes" ? "yes" : "no" }, basis: "model" });

  async function reasked(first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) {
    const settled = automationStudioResultVerificationAgreement(input(first, second));
    const ask = vi.fn(async (_recheck: string, _call: 1 | 2) => judged(LIBRARY_YES));
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input(first, second), settled, ask });
    return { settled, ask, outcome };
  }

  it("is asked once more where the record refutes every reason each no gives", async () => {
    const { settled, ask, outcome } = await reasked(judged(MISSING_LIST_NO), judged(DROPPED_INCLUDING_NO));
    expect(settled.refutedNo).toMatchObject({ calls: [1, 2] });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ verdict: "answers", calls: 4 });
  });

  it("is left as it is where one no's advice names something its refuted observations never do", async () => {
    const more = { ...DROPPED_INCLUDING_NO, changed: `${DROPPED_INCLUDING_NO.changed} Also leave out titles marked 'Large Print'.` };
    const { settled, ask, outcome } = await reasked(judged(MISSING_LIST_NO), judged(more));
    expect(settled.refutedNo).toMatchObject({ calls: [1, 2] });
    expect(ask).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
  });
});
