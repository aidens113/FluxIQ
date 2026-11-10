// A caller's own confirmation (fluxnode-plan N4): its check before any judge, and the judge's mode.
// The check alone, with no loop around it, so each mode's calls can be counted exactly.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowLessSummary } from "../../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstCallerCheck } from "../../../flow-bootstrap-commands/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, automationStudioAnswerFirstCompletionCheck } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const columns = [{ id: "title", label: "Title" }];

function made(confirm: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["confirm"], verdict: "yes" | "no" = "yes") {
  let judged = 0;
  let rows = [{ title: "Atlas" }, { title: "Birds" }];
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "List the books on loan",
    rows: async () => ({ datasetId: "dataset.1", totalRows: rows.length, truncated: false, columns, rows }),
    acts: () => [],
    readsRan: () => true,
    endView: async () => undefined,
    witnesses: () => ({}),
    judge: async () => {
      judged += 1;
      return verdict === "yes" ? { verdict, reason: "It is the list.", checkedWhat: "the list" } : { verdict, reason: "Not what was asked.", checkedWhat: "the list" };
    },
    confirm,
    purse,
    say: () => undefined
  });
  return { check, judged: () => judged, more: () => { rows = [...rows, { title: "Clockmaking" }]; } };
}

const twoRows: AutomationStudioAnswerFirstCallerCheck = (summary) => summary.rows?.totalRows === 2 || "expected two books";

describe("a caller's check", () => {
  it("auto, passing: confirmed by the check with no judge call", async () => {
    const { check, judged } = made({ judge: "auto", check: twoRows });
    expect(await check.check({ summary: "Got it." })).toEqual({ ok: true });
    expect(judged()).toBe(0);
    expect(check.state).toMatchObject({ achieved: true, confirmedBy: "check", timesChecked: 1, checkedWhat: "The caller's own check of the result." });
  });

  it("a no is refused with its reason, as a judge's no; the same evidence is not asked again; new evidence is", async () => {
    let seen: AutomationStudioFlowLessSummary | undefined;
    const { check, judged, more } = made({
      judge: "auto",
      check: (summary) => {
        seen = summary;
        return summary.rows?.totalRows === 3 || "expected three books";
      }
    });
    const first = await check.check({ summary: "Got it." });
    if (first.ok) throw new Error("It should have been refused.");
    expect(first.issueCodes).toEqual(["answer_first.check_no"]);
    expect(first.feedback.instruction).toContain("expected three books");
    expect(check.state).toMatchObject({ achieved: false, refused: { verdict: "no", reason: "expected three books" }, timesChecked: 1 });
    expect(seen?.instructions).toBe("List the books on loan");
    const again = await check.check({ summary: "Got it, again." });
    if (again.ok) throw new Error("It should have been refused.");
    expect(again.issueCodes).toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
    more();
    expect(await check.check({ summary: "Got all three." })).toEqual({ ok: true });
    expect(check.state).toMatchObject({ achieved: true, confirmedBy: "check", refused: undefined, timesChecked: 2 });
    expect(judged()).toBe(0);
  });

  it("a check that throws, or answers false, is a no that names why, and never a throw", async () => {
    const threw = made({ judge: "auto", check: () => { throw new TypeError("outputs is undefined"); } });
    const answer = await threw.check.check({ summary: "Got it." });
    if (answer.ok) throw new Error("It should have been refused.");
    expect(answer.feedback.instruction).toContain("TypeError: outputs is undefined");
    const no = made({ judge: "auto", check: async () => false });
    const said = await no.check.check({ summary: "Got it." });
    if (said.ok) throw new Error("It should have been refused.");
    expect(said.feedback.instruction).toContain("gave no reason");
  });

  it("is given its own copy of the summary, so it cannot change what a judge reads after it", async () => {
    let judgedRows: number | undefined;
    const check = automationStudioAnswerFirstCompletionCheck({
      instructions: "List the books on loan",
      rows: async () => ({ datasetId: "dataset.1", totalRows: 1, truncated: false, columns, rows: [{ title: "Atlas" }] }),
      acts: () => [], readsRan: () => true, endView: async () => undefined, witnesses: () => ({}), purse, say: () => undefined,
      judge: async (summary) => {
        judgedRows = summary.rows?.rows.length;
        return { verdict: "yes", reason: "Fine.", checkedWhat: "the list" };
      },
      confirm: {
        judge: "always",
        check: (summary) => {
          summary.rows?.rows.splice(0);
          return true;
        }
      }
    });
    expect(await check.check({ summary: "Got it." })).toEqual({ ok: true });
    expect(judgedRows).toBe(1);
  });
});

describe("the judge's mode", () => {
  it("always: a passing check is judged too, and confirmed by the judge", async () => {
    const { check, judged } = made({ judge: "always", check: twoRows });
    expect(await check.check({ summary: "Got it." })).toEqual({ ok: true });
    expect(judged()).toBe(1);
    expect(check.state).toMatchObject({ achieved: true, confirmedBy: "judge", timesChecked: 2 });
  });

  it("always: a failing check is a no before any judge", async () => {
    const { check, judged } = made({ judge: "always", check: () => "not yet" });
    expect((await check.check({ summary: "Got it." })).ok).toBe(false);
    expect(judged()).toBe(0);
  });

  it("always, and auto, with no check: the judge, as the chat has it", async () => {
    for (const judge of ["always", "auto"] as const) {
      const { check, judged } = made({ judge });
      expect(await check.check({ summary: "Got it." })).toEqual({ ok: true });
      expect(judged(), judge).toBe(1);
      expect(check.state.confirmedBy, judge).toBe("judge");
    }
  });

  it("off with a check: the check decides, and no judge is called", async () => {
    const { check, judged } = made({ judge: "off", check: twoRows });
    expect(await check.check({ summary: "Got it." })).toEqual({ ok: true });
    expect(judged()).toBe(0);
    expect(check.state).toMatchObject({ achieved: true, confirmedBy: "check" });
  });

  it("off with no check: taken as it is, unverified, never achieved, with no judge call", async () => {
    const { check, judged } = made({ judge: "off" });
    expect(await check.check({ summary: "Got it." })).toEqual({ ok: true });
    expect(judged()).toBe(0);
    expect(check.state).toMatchObject({ achieved: false, takenUnverified: true, timesChecked: 0 });
    expect(check.state.confirmedBy).toBeUndefined();
  });

  it("off with no check still refuses a completion with nothing in it: there is no result to take", async () => {
    const check = automationStudioAnswerFirstCompletionCheck({
      instructions: "List the books on loan",
      rows: async () => ({ totalRows: 0, truncated: false, columns: [], rows: [] }),
      acts: () => [], readsRan: () => false, endView: async () => undefined, witnesses: () => ({}), purse, say: () => undefined,
      judge: async () => { throw new Error("no judge"); },
      confirm: { judge: "off" }
    });
    expect((await check.check({ summary: "Nothing." })).ok).toBe(false);
    expect(check.state.takenUnverified).toBeUndefined();
  });

  it("absent: exactly the judge alone, and nothing says what confirmed it", async () => {
    const { check, judged } = made(undefined);
    expect(await check.check({ summary: "Got it." })).toEqual({ ok: true });
    expect(judged()).toBe(1);
    expect(check.state.confirmedBy).toBeUndefined();
    expect(check.state.takenUnverified).toBeUndefined();
  });
});
