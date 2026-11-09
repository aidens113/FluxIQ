// A look after the acts is evidence (`../check.ts`, `looked`): after an unsure, the same looks are
// refused as the same evidence without a judge, a look that found something new is judged again and
// the judge is given it, the refusal names a look as the way out and never says the trying may end,
// and a credential-shaped line never reaches the judge.
import { describe, expect, it } from "vitest";
import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { AutomationStudioFlowLessSummary } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS, AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, automationStudioAnswerFirstCompletionCheck } from "../index.ts";

type Look = { where: string; found: string };

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const ACT: AutomationStudioAttemptAct = { id: "act.1", what: "Moved two items into a new folder", where: "Saved items", classes: ["create_new"], state: "landed" };
const UNSURE = "The end view does not show what the new folder holds.";
const FOLDER = "http://127.0.0.1:5000/saved/folder/2/";

function made(looks: () => readonly Look[]) {
  const judged: AutomationStudioFlowLessSummary[] = [];
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "Move the saved items by one maker into a new folder",
    rows: async () => ({ totalRows: 0, truncated: false, columns: [], rows: [] }),
    acts: () => [ACT],
    readsRan: () => false,
    endView: async () => undefined,
    witnesses: () => ({}),
    looked: looks,
    judge: async (summary) => {
      judged.push(summary);
      return { verdict: "unsure", reason: UNSURE, checkedWhat: "the folder" };
    },
    purse,
    say: () => undefined
  });
  return { check, judged };
}

describe("a look after the acts, as evidence for the check", () => {
  it("refuses the same looks again without a judge, and judges again once a look found something new, carrying it", async () => {
    const looks: Look[] = [{ where: "http://127.0.0.1:5000/all/", found: "1 match for \"maker\"\nt12 link \"maker\" at the top" }];
    const { check, judged } = made(() => looks);
    const first = await check.check({ summary: "Done." });
    expect(first.ok).toBe(false);
    expect(judged).toHaveLength(1);

    const same = await check.check({ summary: "Done, as I said." });
    if (same.ok) throw new Error("It should have been refused.");
    expect(same.issueCodes).toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
    expect(judged).toHaveLength(1);
    expect(check.state.refusedAgain).toBe(1);

    // The same look made again is no new evidence either.
    looks.push({ ...looks[0]! });
    await check.check({ summary: "Done." });
    expect(judged).toHaveLength(1);
    expect(check.state.refusedAgain).toBe(2);

    const seen: Look = { where: FOLDER, found: "2 matches for \"maker\"\nt40 img \"First item\" (alt=\"by maker\") at the top\nt41 img \"Second item\" (alt=\"by maker\") at the top" };
    looks.push(seen);
    const after = await check.check({ summary: "Done." });
    expect(after.ok).toBe(false);
    expect(judged).toHaveLength(2);
    expect(check.state.refusedAgain).toBe(0);
    expect(judged[1]!.looked).toEqual([looks[0], seen]);
    expect(judged[0]!.looked).toEqual([looks[0]]);
  });

  it("holds no look when none was made, so the summary is as it was", async () => {
    const { check, judged } = made(() => []);
    await check.check({ summary: "Done." });
    expect(judged[0]).not.toHaveProperty("looked");
  });

  it("shows the latest few looks, each cut short", async () => {
    const looks = Array.from({ length: 10 }, (_, index) => ({ where: `http://127.0.0.1:5000/page/${index}/`, found: `${index} ${"word ".repeat(400)}` }));
    const { check, judged } = made(() => looks);
    await check.check({ summary: "Done." });
    const shown = judged[0]!.looked!;
    expect(shown).toHaveLength(6);
    expect(shown[0]!.where).toBe("http://127.0.0.1:5000/page/4/");
    expect(shown.at(-1)!.where).toBe("http://127.0.0.1:5000/page/9/");
    for (const look of shown) expect([...look.found].length).toBeLessThanOrEqual(600);
    expect(JSON.stringify(shown).length).toBeLessThan(5_000);
  });

  it("keeps a credential-shaped line out of what the judge is given, and the rest of what was found in", async () => {
    const secret = "sk-abcdefghij0123456789abcd";
    const { check, judged } = made(() => [{ where: FOLDER, found: `2 matches for "maker"\nt40 field "API key" value ${secret}\nt41 img "Second item" (alt="by maker") at the top` }]);
    await check.check({ summary: "Done." });
    const sent = JSON.stringify(judged[0]);
    expect(sent).not.toContain("sk-abcdefghij");
    expect(judged[0]!.looked![0]!.found).toContain("2 matches for \"maker\"");
    expect(judged[0]!.looked![0]!.found).toContain("(withheld)");
    expect(judged[0]!.looked![0]!.found).toContain("Second item");
  });
});

describe("what a refusal says of a look", () => {
  const WORDS = AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS;

  it("names a look at the page as new evidence, and how to make it", () => {
    for (const words of [WORDS.judged(UNSURE), WORDS.sameEvidence("unsure", UNSURE), WORDS.freshRound(false)]) {
      expect(words).toContain("a look at the page that shows what the check said it could not see");
      expect(words).toContain("open that page, then read or search it there");
    }
  });

  it("never says the trying may end", () => {
    for (const words of [WORDS.judged(UNSURE), WORDS.sameEvidence("unsure", UNSURE), WORDS.sameEvidence("no", UNSURE), WORDS.freshRound(true)]) {
      expect(words).not.toContain("need not keep trying");
      expect(words).not.toContain("If you cannot get anything new");
    }
    expect(WORDS.sameEvidence("unsure", UNSURE)).toContain("So get something new before you complete again");
  });
});
