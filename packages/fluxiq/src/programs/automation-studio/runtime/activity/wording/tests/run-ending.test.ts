import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTIVITY_LIMITS } from "../../limits.ts";
import { automationStudioActivityRunEnding, automationStudioActivityRunObjection } from "../run-ending.ts";

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
    expect(said).toBe("it saved 13 rows, but the check found they don't answer what you asked, and the fix ran out of build rounds before it could test a change.");
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
    expect(automationStudioActivityRunEnding(refuted)).toBe("it saved 13 rows, but the check found they don't answer what you asked.");
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
    // W17 (run `run-muw5zv4m-52d83027`): a re-author that found the Flow already does what was asked, and changed nothing.
    const nothing = ending({ outcome: "not_rerun" }, { resultReauthor: { routed: true, outcome: "nothing_to_change", reason: "Step 11 added both packs." } });
    expect(nothing).toMatch(/, and the repair found nothing in the Flow to change\.$/u);
    expect(`Run failed: ${nothing}`.length).toBeLessThanOrEqual(160);
  });

  it("says one row and no rows as such, and a check that could not decide as unconfirmed", () => {
    expect(automationStudioActivityRunEnding({ resultVerification: { ...refuted.resultVerification, observation: "1 record stored" } })).toBe("it saved 1 row, but the check found it doesn't answer what you asked.");
    expect(automationStudioActivityRunEnding({ resultVerification: { ...refuted.resultVerification, observation: "0 records stored" } })).toBe("it saved no rows, so it doesn't answer what you asked.");
    expect(automationStudioActivityRunEnding({ resultVerification: { ...refuted.resultVerification, verdict: "unsure", observation: "4 records stored" } })).toBe("it saved 4 rows, but the check couldn't confirm they answer what you asked.");
  });

  it("gives no row count for a run whose result declared no record set (cart Flow, run-muw5zv4m-52d83027)", () => {
    const cart = { ...refuted.resultVerification, observation: "0 records stored, across 0 record sets; the Flow's steps were browser.press" };
    expect(automationStudioActivityRunEnding({
      resultVerification: cart,
      resultRepair: { attempted: true, attempts: 1, history: [{ attempt: 1, totalRecordCount: 0, recordSetCount: 0 }], phase: "reauthoring" },
      resultReauthor: { code: "flow_bootstrap.evidence_budget_exhausted", attempts: [{ attempt: 1, ending: { kind: "budget_exhausted", bound: "tokens", tried: { tested: "not_tested" } } }] }
    })).toBe("the check found its result doesn't answer what you asked, and the fix reached its limit before it could test a change.");
    expect(automationStudioActivityRunEnding({ resultVerification: cart })).toBe("the check found its result doesn't answer what you asked.");
    // A declared record set that stored nothing still saved no rows.
    expect(automationStudioActivityRunEnding({ resultVerification: { ...cart, observation: "0 records stored, across 1 record set" }, resultRepair: { attempted: true, history: [{ attempt: 1, totalRecordCount: 0, recordSetCount: 1 }] } })).toBe("it saved no rows, so it doesn't answer what you asked, and the fix didn't finish.");
  });

  it("says the refutation even when nothing counts the rows", () => {
    expect(automationStudioActivityRunEnding({ resultVerification: { ...refuted.resultVerification, observation: "the list was empty" } })).toBe("the check found its result doesn't answer what you asked.");
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

  // t276, U-10 of `run-muw60j7c-bb7c9a62` (picture 16): "Run failed — It returned 30 rows, but the check found
  // they don't answer what you asked, and the fix ran out of build rounds before it could test a change."
  it("says the rows were saved, in lower case after the dash the chat puts before it (U-10)", () => {
    const said = automationStudioActivityRunEnding({
      resultVerification: { ...refuted.resultVerification, observation: "30 records stored, across 1 record set" },
      resultRepair: { ...repairEnded({ outcome: "not_rerun" }), history: [{ attempt: 1, totalRecordCount: 30 }] },
      resultReauthor: { code: "flow_bootstrap.evidence_budget_exhausted", attempts: [{ attempt: 1, ending: { kind: "budget_exhausted", bound: "rounds", tried: { tested: "not_tested" } } }] }
    })!;
    expect(said).toBe("it saved 30 rows, but the check found they don't answer what you asked, and the fix ran out of build rounds before it could test a change.");
    expect(said).not.toMatch(/^[A-Z]|returned/u);
  });
});

// R3-U-3 of the live-C round-3 UI review (run-mux6naez-6c20f26e, moment 26): "it saved 13 rows, but the
// check found they don't answer what you asked, and the fix used all its rounds" named no objection,
// while the 13 rows were the right ones and the check's doubt was about two items; and "all its
// rounds" read against "attempt 1 of 3". The check's own reason is said after the ending, in whole
// sentences, and the limit is called the build rounds it was.
describe("what the check objected to", () => {
  it("says the check's reason in whole sentences, screened, and nothing when it gave none", () => {
    const reason = "Two products with the Plus badge were left out: the plus condition dropped them. The other 13 rows look right.";
    expect(automationStudioActivityRunObjection({ resultVerification: { ...refuted.resultVerification, reason } })).toBe(`The check said: ${reason}`);
    expect(automationStudioActivityRunObjection({ resultVerification: { ...refuted.resultVerification, reason: "step node.bootstrap.1.main.s7 kept extraction.4 rows" } }) ?? "").not.toMatch(/node\.bootstrap|extraction\.4/u);
    expect(automationStudioActivityRunObjection(refuted)).toBeUndefined();
    expect(automationStudioActivityRunObjection({ resultVerification: { status: "confirmed", performed: true, verdict: "answers", reason } })).toBeUndefined();
  });
});
