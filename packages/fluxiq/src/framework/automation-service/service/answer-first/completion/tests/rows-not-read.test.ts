// A request that asks for rows back is not completed on words alone: the check refuses it, with no
// judge, while no read has run in the attempt (lane B, run-mw45itmx-c4d6f5cb, where the table was
// typed into `answer`, a judge said yes over 0 rows, and the person got no table). The check alone.
import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioAnswerFirstCompletionCheck } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const TABLE = "Renew the card on my library account. Then give me my loans as a table with columns title and due.";
const TABLE_SENTENCE = "Then give me my loans as a table with columns title and due";
const ACT = { state: "landed" } as unknown as AutomationStudioAttemptAct;
const WORDS = "| title | due |\n|---|---|\n| Atlas of Rivers | 2030-01-01 |";

function made(input: { instructions: string; rows?: JsonObject[]; readsRan?: boolean; acts?: AutomationStudioAttemptAct[] }) {
  let judged = 0;
  const rows = input.rows ?? [];
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: input.instructions,
    rows: async () => (rows.length ? { datasetId: "dataset.1", totalRows: rows.length, truncated: false, columns: [{ id: "title", label: "Title" }], rows } : { totalRows: 0, truncated: false, columns: [], rows: [] }),
    acts: () => input.acts ?? [ACT],
    readsRan: () => input.readsRan ?? false,
    endView: async () => undefined,
    witnesses: () => ({}),
    judge: async () => {
      judged += 1;
      return { verdict: "yes", reason: "It is what was asked.", checkedWhat: "the result" };
    },
    purse,
    say: () => undefined
  });
  return { check, judged: () => judged };
}

describe("a request that asks for rows, completed with no read", () => {
  it("is refused rows_not_read with no judge call, its words quoting the person's sentence and saying how to get the rows", async () => {
    const { check, judged } = made({ instructions: TABLE });
    const answer = await check.check({ summary: "Renewed the card and listed the loans.", answer: WORDS });
    if (answer.ok) throw new Error("It should have been refused.");
    expect(answer.issueCodes).toEqual(["answer_first.rows_not_read"]);
    expect(answer.feedback.instruction).toContain(`("${TABLE_SENTENCE}")`);
    expect(answer.feedback.instruction).toContain("Rows come only from a read of the page");
    expect(answer.feedback.instruction).toContain("If that read finds none, complete then");
    expect(judged()).toBe(0);
    expect(check.state.achieved).toBe(false);
    // Not a judged refusal, so nothing climbs the same-evidence ladder.
    expect(check.state.refused).toBeUndefined();
    expect(check.state.refusedAgain).toBe(0);
  });

  it("is judged once a read has run, even one that found nothing: an empty result is the judge's to weigh", async () => {
    const { check, judged } = made({ instructions: TABLE, readsRan: true });
    expect(await check.check({ summary: "Renewed the card; there are no loans.", answer: "There are no loans." })).toEqual({ ok: true });
    expect(judged()).toBe(1);
  });

  it("is judged when it holds rows", async () => {
    const { check, judged } = made({ instructions: TABLE, rows: [{ title: "Atlas of Rivers" }], readsRan: true });
    expect(await check.check({ summary: "Listed." })).toEqual({ ok: true });
    expect(judged()).toBe(1);
  });
});

describe("a request that asks for nothing back", () => {
  it("is judged on an answer in words with no read, as before: a question whose answer is one value", async () => {
    const { check, judged } = made({ instructions: "What is the fine on my overdue loan?", acts: [] });
    expect(await check.check({ summary: "Found the fine.", answer: "The fine is 40p." })).toEqual({ ok: true });
    expect(judged()).toBe(1);
  });

  it("is judged on its acts with no read, as before", async () => {
    const { check, judged } = made({ instructions: "Renew the card on my library account." });
    expect(await check.check({ summary: "Renewed the card." })).toEqual({ ok: true });
    expect(judged()).toBe(1);
  });

  it("still says nothing_to_judge first when there is nothing at all, whatever was asked", async () => {
    const { check } = made({ instructions: TABLE, acts: [] });
    const answer = await check.check({ summary: "Nothing yet." });
    expect(answer.ok ? [] : answer.issueCodes).toEqual(["answer_first.nothing_to_judge"]);
  });
});
