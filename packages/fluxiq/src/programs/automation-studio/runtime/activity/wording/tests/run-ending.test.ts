import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTIVITY_LIMITS } from "../../limits.ts";
import { automationStudioActivityRunEnding } from "../run-ending.ts";

/** The run record of `run-musp39u8-9ac026ab`, as far as the ending reads it. */
const refuted = {
  resultVerification: {
    status: "refuted",
    performed: true,
    verdict: "does_not_answer",
    code: "core.result.does_not_answer_request",
    observation: "13 records stored, across 1 record set; step node.bootstrap.64c205b534adb35d.main.s7 read every page (5)"
  }
};
const repairEnded = (marker: Record<string, unknown>) => ({ attempted: true, attempts: 1, maxAttempts: 3, history: [{ attempt: 1, totalRecordCount: 13 }], phase: "settled", ...marker });

describe("automationStudioActivityRunEnding", () => {
  it("says what came back, that the check refuted it, and how the repair ended (U3, run-musp39u8-9ac026ab)", () => {
    const said = automationStudioActivityRunEnding({
      ...refuted,
      resultRepair: repairEnded({ outcome: "not_rerun" }),
      resultReauthor: { code: "flow_bootstrap.evidence_budget_exhausted", attempts: [{ attempt: 1, ending: { kind: "budget_exhausted", bound: "rounds", tried: { rounds: 6, decisions: 37, stepsInFlow: 7, tested: "not_tested" } } }] }
    });
    expect(said).toBe("It returned 13 rows, but the check found they don't answer what you asked, and the fix used all its rounds before it could test a change.");
  });

  it("names the limit the re-author's last build stopped at, and whether it tested anything", () => {
    const stopped = (bound: string, tested: string) => automationStudioActivityRunEnding({
      ...refuted,
      resultRepair: repairEnded({ outcome: "not_rerun" }),
      resultReauthor: { code: "flow_bootstrap.evidence_budget_exhausted", attempts: [{ attempt: 1, ending: { kind: "budget_exhausted", bound, tried: { tested } } }] }
    });
    expect(stopped("cost", "not_tested")).toMatch(/, and the fix spent all a repair may spend before it could test a change\.$/u);
    expect(stopped("duration", "tested")).toMatch(/, and the fix ran out of time before it finished\.$/u);
    expect(stopped("tokens", "tested")).toMatch(/, and the fix reached its limit before it finished\.$/u);
    // No recorded ending: the code alone, never the old "ran out of room".
    expect(automationStudioActivityRunEnding({ ...refuted, resultRepair: repairEnded({ outcome: "not_rerun" }), resultReauthor: { code: "flow_bootstrap.evidence_budget_exhausted" } })).toMatch(/, and the fix reached its limit before it finished\.$/u);
  });

  it("reads the count from the check's own observation when no repair recorded one", () => {
    expect(automationStudioActivityRunEnding(refuted)).toBe("It returned 13 rows, but the check found they don't answer what you asked.");
  });

  it("says each way a repair can end", () => {
    const ending = (marker: Record<string, unknown>, extra: Record<string, unknown> = {}) => automationStudioActivityRunEnding({ ...refuted, resultRepair: repairEnded(marker), ...extra });
    expect(ending({ outcome: "rerun_failed" })).toMatch(/, and the fixed Flow didn't run to the end\.$/u);
    expect(ending({ outcome: "stopped", stopped: "result_repair.attempts_exhausted", attempts: 3 })).toMatch(/, and 3 tries at fixing it didn't help\.$/u);
    expect(ending({ outcome: "stopped", stopped: "result_repair.not_converging", attempts: 2 })).toMatch(/, and fixing it kept giving the same answer\.$/u);
    expect(ending({ outcome: "unverified" })).toMatch(/, and the fixed Flow's answer couldn't be checked\.$/u);
    expect(ending({ outcome: "not_rerun" }, { resultReauthor: { code: "flow_bootstrap.deadline_exceeded" } })).toMatch(/, and the fix ran out of time before it finished\.$/u);
    expect(ending({ outcome: "not_rerun" })).toMatch(/, and the fix didn't finish\.$/u);
    expect(ending({ phase: "reauthoring", outcome: undefined })).toMatch(/, and the fix didn't finish\.$/u);
  });

  it("says one row and no rows as such, and a check that could not decide as unconfirmed", () => {
    expect(automationStudioActivityRunEnding({ resultVerification: { ...refuted.resultVerification, observation: "1 record stored" } })).toBe("It returned 1 row, but the check found it doesn't answer what you asked.");
    expect(automationStudioActivityRunEnding({ resultVerification: { ...refuted.resultVerification, observation: "0 records stored" } })).toBe("It returned no rows, so it doesn't answer what you asked.");
    expect(automationStudioActivityRunEnding({ resultVerification: { ...refuted.resultVerification, verdict: "unsure", observation: "4 records stored" } })).toBe("It returned 4 rows, but the check couldn't confirm they answer what you asked.");
  });

  it("says the refutation even when nothing counts the rows", () => {
    expect(automationStudioActivityRunEnding({ resultVerification: { ...refuted.resultVerification, observation: "the list was empty" } })).toBe("The check found its result doesn't answer what you asked.");
  });

  it("says nothing for a run that did not fail at its result check", () => {
    expect(automationStudioActivityRunEnding(undefined)).toBeUndefined();
    expect(automationStudioActivityRunEnding({})).toBeUndefined();
    expect(automationStudioActivityRunEnding({ resultVerification: { status: "confirmed", performed: true, verdict: "answers" } })).toBeUndefined();
    expect(automationStudioActivityRunEnding({ resultVerification: { status: "unverified", performed: false, code: "core.check.authorization_absent" } })).toBeUndefined();
  });

  it("fits a status line after \"Run failed: \", with no id a person would read", () => {
    const said = automationStudioActivityRunEnding({ ...refuted, resultRepair: repairEnded({ outcome: "stopped", stopped: "result_repair.attempts_exhausted", attempts: 3 }) })!;
    expect(`Run failed: ${said}`.length).toBeLessThanOrEqual(AUTOMATION_STUDIO_ACTIVITY_LIMITS.label);
    expect(said).not.toMatch(/\b[a-z]+\.[a-z_]+/iu);
  });
});
