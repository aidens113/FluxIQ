// A yes not taken because it never said why the result keeps rows a condition
// left out of what the Flow acted on and another read stored is said so in
// Core's words (t691, `../said.ts`), wherever a split or an unsure is explained.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerification } from "../../contracts/index.ts";
import { automationStudioRequestRowsStoredLine } from "../../request-rows/index.ts";
import { RENEWALS_ACT_READ, RENEWALS_LEFT_OUT_ROWS, RENEWALS_LIST_READ } from "../../request-rows/tests/renewals-fixture.ts";
import { said } from "../said.ts";

const LINE = automationStudioRequestRowsStoredLine({ nodeId: RENEWALS_ACT_READ, condition: "condition 1 (daysOverdue atLeast 5)", rows: RENEWALS_LEFT_OUT_ROWS, stored: [RENEWALS_LIST_READ] });
const base = { schemaVersion: "automation-studio.result-verification.v1", reason: "Judged.", observation: "12 records stored." } as const;
const REPAIR = { schemaVersion: "automation-studio.result-repair-directive.v1" as const, findings: [], fix: [] };
const STORED_WORDS = "that it does what was asked, without saying, beside the read that stored each, why the result keeps the rows a condition left out of what the Flow acted on";

describe("Core's words for a yes not taken over rows another read stored", () => {
  it("say so of a yes Core held for them", () => {
    const held: AutomationStudioResultVerification = { ...base, verdict: "unsure", basis: "model_unconfirmed", code: "core.result.exclusion_evidence_missing", exclusionEvidenceMissing: ["Another line.", LINE], yesUnconfirmed: true };
    expect(said(held)).toBe(STORED_WORDS);
  });

  it("say so of a yes Core refused with them beside another finding", () => {
    const refused: AutomationStudioResultVerification = { ...base, verdict: "does_not_answer", basis: "model", code: "core.result.does_not_answer_request", repair: { ...REPAIR, checked: [LINE] } };
    expect(said(refused)).toBe(STORED_WORDS);
  });

  it("leave a held yes without such a line, and a model's own no, as they were", () => {
    const held: AutomationStudioResultVerification = { ...base, verdict: "unsure", basis: "model_unconfirmed", code: "core.result.exclusion_evidence_missing", exclusionEvidenceMissing: ["Another line."], yesUnconfirmed: true };
    expect(said(held)).toBe("that it could not be told");
    const no: AutomationStudioResultVerification = { ...base, verdict: "does_not_answer", basis: "model", code: "core.result.does_not_answer_request", repair: { ...REPAIR, checked: [LINE], judgement: { observed: "Four rows are extra." } } };
    expect(said(no)).toBe("that it does not do what was asked");
  });
});
