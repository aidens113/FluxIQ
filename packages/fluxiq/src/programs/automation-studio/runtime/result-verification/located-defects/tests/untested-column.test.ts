// A no calling a left-out row missing by a column the one condition that left
// it out did not test is not located (t790, `../untested-column.ts`); quoting
// the tested column's own value it is located as before. Run
// `run-mvswewhy-e4e469d4`'s shape -- rows a condition of one column left out,
// called missing by their dates -- on the made-up club board of
// `./club-posts-fixture.ts`, with each post's date beside its club.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";
import { MEMBER_REQUEST, NAMED_CLUBS_REQUEST, clubPostsInstruction, clubPostsRunSummary } from "./club-posts-fixture.ts";

/**
 * The club board with a `posted` column: Ann Lee's post, `{ club: "C Club",
 * posted: "3 May" }`, left out by condition 1 alone. `condition` replaces the
 * authored condition and its wording; `said`, how the read sent the row;
 * `authored: false` drops the step's parameters, as a called part's read has none.
 */
function datedSummary(options: { condition?: JsonObject; wording?: string; said?: string; authored?: boolean } = {}): AutomationStudioRunResultSummary {
  const summary = clubPostsRunSummary();
  const set = summary.recordSets[0]!;
  set.columns = ["author", "club", "posted"];
  set.sampleRows = [{ author: "Dana Ortiz", club: "A Club", posted: "2 May" }];
  const condition = summary.reads![0]!.conditions![0]!;
  condition.leftOutCells = [{ club: "C Club", posted: "3 May" }];
  if (options.said) condition.leftOutOnlyByThis = [options.said];
  if (options.wording) condition.condition = options.wording;
  const step = summary.flowShape[0]!;
  if (options.authored === false) delete step.parameters;
  else step.parameters = {
    extractList: {
      where: { count: 1, items: [options.condition ?? { field: "club", equals: { count: 2, items: ["A Club", "B Club"] } }] },
      fields: { author: { kind: "text" }, club: { kind: "text" }, posted: { kind: "text" } }
    }
  };
  return summary;
}

function located(defects: AutomationStudioLlmVerificationDefect[], request: string, summary: AutomationStudioRunResultSummary = datedSummary()) {
  const wording = automationStudioRequestWording([clubPostsInstruction(request)], summary);
  const record = automationStudioResultNoRecord({ summary, requestText: request, wording });
  return automationStudioResultDefectsLocated(defects, { record, summary });
}

const byDate: AutomationStudioLlmVerificationDefect = { kind: "asked_missing", row: "Ann Lee", column: "posted", value: "3 May", requestWords: MEMBER_REQUEST };
const byClub: AutomationStudioLlmVerificationDefect = { kind: "asked_missing", row: "Ann Lee", column: "club", value: "C Club", requestWords: MEMBER_REQUEST };

describe("a row called missing by a column the one condition that left it out did not test (t790)", () => {
  it("is not located, though the row's cell says the value, and Core's finding names the condition and its column", () => {
    const result = located([byDate], MEMBER_REQUEST);
    expect(result.located).toEqual([]);
    expect(result.findings).toEqual([
      "Core's record of \"Ann Lee\" was left out only by condition 1 (club equals [\"A Club\", \"B Club\"]), which tests \"club\"; the defect quotes \"posted\", which condition 1 did not test, so it does not show why condition 1 should keep that row. Quote that row's own value in \"club\"."
    ]);
  });

  it("is located where it quotes the tested column with a value the request says", () => {
    const result = located([{ ...byClub, requestWords: NAMED_CLUBS_REQUEST }], NAMED_CLUBS_REQUEST);
    expect(result.findings).toEqual([]);
    expect(result.located).toHaveLength(1);
  });

  it("is located where it quotes the tested column's own value and the condition is no `equals` list (t785 does not apply)", () => {
    const summary = datedSummary({ condition: { field: "club", not: true, equals: "C Club" }, wording: "club not equals \"C Club\"" });
    expect(located([byClub], MEMBER_REQUEST, summary)).toEqual({ located: [byClub], findings: [] });
    // The same condition, quoted by the date: not located, whatever the condition's relation.
    const byDateResult = located([byDate], MEMBER_REQUEST, summary);
    expect(byDateResult.located).toEqual([]);
    expect(byDateResult.findings.join(" ")).toContain("condition 1 (club not equals \"C Club\"), which tests \"club\"; the defect quotes \"posted\"");
  });

  it("knows the tested column from the column the row is said with, where the step is not held as authored", () => {
    const summary = datedSummary({ authored: false, said: "Ann Lee — club: C Club" });
    const result = located([byDate], MEMBER_REQUEST, summary);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("which tests \"club\"; the defect quotes \"posted\"");
    expect(located([byClub], MEMBER_REQUEST, summary).located).toHaveLength(1);
  });

  it("is held to the row's cells as before where Core cannot tell which column the condition tests", () => {
    // No authored step and a row said by its label alone: the cell says "3 May", so it is located (t771).
    expect(located([byDate], MEMBER_REQUEST, datedSummary({ authored: false })).located).toHaveLength(1);
  });
});
