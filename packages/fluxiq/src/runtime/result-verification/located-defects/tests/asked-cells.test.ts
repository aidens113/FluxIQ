// A no calling a left-out row missing is held to that row's own cells (t771):
// it names the row by Core's id or its whole label, gives the column and the
// row's value in it that makes it asked for, and Core finds it only where the
// row's cell says that value. A row's name is never matched through another
// row's label further on in its words. Rerun round 6 social
// `run-mvrj7qg8-c20c132e`: a judge gave a friend's own post a group it does not
// have, and Core first located that claim, then told the judge the invented
// row "is a row the result holds" for a stored row whose label was the group.
// On the made-up notice board of `./club-notices-fixture.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { AutomationStudioRequestRowId, automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";
import { CLUB_WORDS, NOTICE_REQUEST, noticeInstruction, noticeRunSummary } from "./club-notices-fixture.ts";

function located(defects: AutomationStudioLlmVerificationDefect[], summary: AutomationStudioRunResultSummary = noticeRunSummary()) {
  const wording = automationStudioRequestWording([noticeInstruction()], summary);
  const record = automationStudioResultNoRecord({ summary, requestText: NOTICE_REQUEST, wording });
  return automationStudioResultDefectsLocated(defects, { record, summary });
}

const missing = (row: string, extra: Partial<AutomationStudioLlmVerificationDefect> = {}): AutomationStudioLlmVerificationDefect => ({ kind: "asked_missing", row, column: "club", value: "Chess Club", requestWords: CLUB_WORDS, ...extra });

describe("a left-out row called missing, held to its own cells (t771)", () => {
  it("is not found where the row's own cell does not say the value the no gives it", () => {
    const result = located([missing("Ann Lee — Chess Club, 6 March 2027")]);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("holds \"Ann Lee\" in \"club\", not \"Chess Club\"");
  });

  it("is found where the row's own cell says it", () => {
    expect(located([missing("Ann Lee — Chess Club, 6 March 2027")], noticeRunSummary("Chess Club")).located).toHaveLength(1);
  });

  it("is found by Core's id for the row as by its label", () => {
    expect(located([missing(`the row ${AutomationStudioRequestRowId.of("Ann Lee")}`)], noticeRunSummary("Chess Club")).located).toHaveLength(1);
  });

  it("is not found where the no gives no column and value of the row", () => {
    const result = located([{ kind: "asked_missing", row: "Ann Lee", requestWords: CLUB_WORDS }], noticeRunSummary("Chess Club"));
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("names no column and value");
  });

  it("holds a row two conditions left out together to its cells too", () => {
    expect(located([missing("Bo Kim", { column: "posted", value: "1 May 2026" })]).located).toHaveLength(1);
    expect(located([missing("Bo Kim", { column: "club", value: "Chess Club" })]).located).toEqual([]);
  });

  it("never takes a stored row's label found further on in a row's words for that row", () => {
    const result = located([missing("Cy Park — Chess Club, 6 March 2027")]);
    expect(result.located).toEqual([]);
    const findings = result.findings.join(" ");
    expect(findings).not.toContain("is a row the result holds");
    expect(findings).toContain("Core holds no record of");
  });

  it("still finds a stored row named by its whole label first, as a kept row", () => {
    expect(located([{ kind: "kept_not_asked", row: "Chess Club — Dana Ortiz, 6 March 2027", requestWords: CLUB_WORDS }]).located).toHaveLength(1);
  });
});
