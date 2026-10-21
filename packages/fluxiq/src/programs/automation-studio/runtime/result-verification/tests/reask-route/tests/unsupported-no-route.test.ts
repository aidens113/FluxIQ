// A stub-judge replay of the round-5 breadth rerun's shape (t752) through the
// verification (`../../../verify.ts`): a revision stored exactly the rows asked
// for, beside working rows of an earlier read of the same list, after an earlier
// judge advised the very change it made; both judges said no, one for the method
// and a count, the other for a claim about a condition, and neither named a row
// Core can find wrongly kept, missing, or holding a wrong value. Each such no is
// asked once more to list its defects; a no still naming none is never a no. On
// the made-up library account of `../../../agreement/tests/loan-fixture.ts`: no
// task, site, item or answer of any realistic scenario. No model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { automationStudioResultVerificationFailsRun } from "../../../contracts/index.ts";
import { LOAN_FALSE_CLAIM_NO, LOAN_KEPT_NO, LOAN_METHOD_NO, LOAN_YES, loanInstruction, loanRunSummary } from "../../../agreement/tests/loan-fixture.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../../../verdict/index.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A provider answering each call with its own diagnosis, keeping every request it was sent. */
function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        const diagnosis = diagnoses[seen.length];
        seen.push(request);
        if (!diagnosis) throw new Error("no call scripted");
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const verify = (provider: AutomationStudioLlmProvider, summary = loanRunSummary()) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "build-test.1", summary, instructions: [loanInstruction()], deniedEvidenceKeys: [], provider, confirmAnswer: true });

/** The recheck a request carried, as the judge's copy of the summary holds it. */
const recheckOf = (request: AutomationStudioLlmTaskRequest | undefined): string => String(request?.context.resultSummary?.recheck ?? "");

describe("a double no naming no defect Core can find, through the verification (t752)", () => {
  it("asks each no once more to list its defects, saying this revision did what an earlier judge advised, and two yeses there confirm", async () => {
    const { provider, seen } = answering(LOAN_METHOD_NO, LOAN_FALSE_CLAIM_NO, LOAN_YES, LOAN_YES);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    for (const reask of [seen[2], seen[3]]) {
      const words = recheckOf(reask);
      expect(words).toContain("named no defect Core can find in this result");
      expect(words).toContain("list each defect in defects");
      expect(words).toContain("This revision changed a step or condition named by the judge of revision 2");
      expect(words).toContain("That change does not prove the advice was followed or correct");
      expect(words).toContain("Ordering, formatting, missing columns, actions");
      expect(words).toContain("An absent structured row defect does not establish correctness");
      // Core's own words are generic: nothing of the site, its rows or its task before the findings, which quote the no.
      expect(words.split("What Core found of that answer:")[0]).not.toMatch(/\b(?:loan|book|library|renewal|status)\w*/iu);
      expect(words).toContain("What Core found of that answer:");
    }
    expect(recheckOf(seen[1])).not.toContain("named no defect Core can find");
    expect(report.interventions.slice(2).map((intervention) => intervention.metadata)).toEqual([
      expect.objectContaining({ verificationCheck: 1, verificationReask: true }),
      expect.objectContaining({ verificationCheck: 2, verificationReask: true })
    ]);
    expect(report.outcome).toMatchObject({ verdict: "answers", verdicts: ["does_not_answer", "does_not_answer", "answers", "answers"], calls: 4 });
    expect(report.outcome.performed && report.outcome.unsupportedNo).toBeFalsy();
  });

  it("is never a no where the re-asked calls still name no defect Core can find: unsure, marked, Core's record kept", async () => {
    const { provider, seen } = answering(LOAN_METHOD_NO, LOAN_FALSE_CLAIM_NO, LOAN_METHOD_NO, LOAN_FALSE_CLAIM_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    const outcome = report.outcome;
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported, calls: 4 });
    expect(outcome.unsupportedNo?.calls).toEqual([1, 2]);
    expect(outcome.unsupportedNo?.findings.join(" ")).toContain("are not words the request says");
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
    expect(outcome.repair).toBeUndefined();
    expect(outcome.unconfirmedReading?.advice).toContain("Remove the status condition.");
    expect(outcome.standingNo).toBeDefined();
    // The reason a run records is Core's words: no row, no judge's prose.
    expect(outcome.reason).not.toMatch(/Cartographer|renewal|status text/u);
  });

  it("asks only once, and a no that is still unsupported is unsure where a call did not come back", async () => {
    const { provider, seen } = answering(LOAN_METHOD_NO, LOAN_FALSE_CLAIM_NO, LOAN_METHOD_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    expect(report.outcome).toMatchObject({ verdict: "unsure", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
  });

  it("keeps the verdict no where one re-asked call lists a defect Core finds", async () => {
    const { provider } = answering(LOAN_METHOD_NO, LOAN_FALSE_CLAIM_NO, LOAN_KEPT_NO, LOAN_FALSE_CLAIM_NO);
    const report = await verify(provider);
    const outcome = report.outcome;
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "does_not_answer", calls: 4 });
    expect(outcome.unsupportedNo?.calls).toEqual([2]);
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(true);
    expect(outcome.repair?.judgement?.observed).toContain("due next week");
  });

  it("asks nothing more where a no lists a kept row Core finds stored, quoting the request: the no stands", async () => {
    const { provider, seen } = answering(LOAN_KEPT_NO, LOAN_METHOD_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
  });

  it("says nothing of an earlier judge where the build gave no earlier advice", async () => {
    const { provider, seen } = answering(LOAN_METHOD_NO, LOAN_FALSE_CLAIM_NO, LOAN_YES, LOAN_YES);
    await verify(provider, loanRunSummary({ earlierAdvice: false }));
    expect(recheckOf(seen[2])).toContain("list each defect in defects");
    expect(recheckOf(seen[2])).not.toContain("earlier judge");
    expect(recheckOf(seen[2])).not.toContain("revision 2");
  });
  it.each(["wrong ordering", "wrong date formatting", "missing required column", "missing required action", "unmeasured constraint"])("holds an unmeasurable %s as unsure even when earlier advice named the change", async (requirement) => {
    const no = { answersRequest: "no", observed: requirement, defects: [{ kind: "other", row: requirement, requestWords: "with its title, due date and renewals left" }] };
    const { provider, seen } = answering(no, no, no, no);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    expect(report.outcome).toMatchObject({ verdict: "unsure", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(recheckOf(seen[2])).toContain("including defects introduced by that advice");
    expect(recheckOf(seen[2])).toContain("answer yes only after independently checking every requirement");
    expect(report.outcome.performed && report.outcome.firstAskConfirmed).toBeFalsy();
  });

  it("keeps a concrete wrong row introduced by earlier advice as no", async () => {
    const { provider, seen } = answering(LOAN_KEPT_NO, LOAN_KEPT_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer" });
  });

  it("refuses an omitted current negative defect account and distinguishes an explicitly empty list", async () => {
    const { defects, ...legacy } = LOAN_METHOD_NO;
    const old = answering(legacy, legacy);
    const oldReport = await verify(old.provider);
    expect(oldReport.outcome).toMatchObject({ verdict: "unsure" });
    expect(oldReport.interventions.some((entry) => JSON.stringify(entry).includes("verification_defects_required"))).toBe(true);
    const current = answering(LOAN_METHOD_NO, LOAN_METHOD_NO, LOAN_METHOD_NO, LOAN_METHOD_NO);
    const currentReport = await verify(current.provider);
    expect(current.seen).toHaveLength(4);
    expect(currentReport.outcome).toMatchObject({ verdict: "unsure" });
  });

  it.each(["renewals", "renewals left"])("checks a false value claim using the same unique column resolution for %s", async (column) => {
    const no = { answersRequest: "no", observed: "A kept row's renewals value is wrong.", defects: [{ kind: "wrong_value", row: "Winter at Holloway Mill", column, value: "9", requestWords: "renewals left" }] };
    const { provider, seen } = answering(no, no, no, no);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    expect(report.outcome).toMatchObject({ verdict: "unsure", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(recheckOf(seen[2])).toContain("stored cell contradicts the value");
  });

  it.each([
    { defects: "not a list" },
    { defects: [{ kind: "unknown", row: "a row", requestWords: "loans" }] },
    { defects: [{ kind: "wrong_value", row: "a row", value: "9", requestWords: "loans" }] },
    { defects: [{ kind: "kept_not_asked", row: "Winter at Holloway Mill", requestWords: "marked due this week" }, { kind: "unknown", row: "a row", requestWords: "loans" }] }
  ])("keeps a malformed current negative defect account nonpromotable (%j)", async ({ defects }) => {
    const no = { answersRequest: "no", observed: "A problem was claimed.", defects };
    const { provider } = answering(no, no, no, no);
    const report = await verify(provider);
    expect(report.outcome).toMatchObject({ verdict: "unsure" });
    expect(report.interventions.some((entry) => JSON.stringify(entry).includes("verification_defects_required"))).toBe(true);
  });

});
