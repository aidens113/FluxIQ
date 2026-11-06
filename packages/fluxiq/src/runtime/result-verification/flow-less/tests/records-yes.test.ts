// The Flow-less judge's yes stands on the rows the result holds (t875), through the real
// harness with a scripted provider: no model is called. The shape is lane B's
// `run-mw4b7kav-cbff03e1` (a yes over 3 stored rows whose own words said the list asked
// for shows 5); the fixture is a choir's music library, a kind of site no realistic
// scenario uses.
import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** Three pieces a search found; the shelf the request names holds five. */
const ROWS: AutomationStudioFlowLessSummary["rows"] = {
  totalRows: 3,
  truncated: false,
  columns: [{ id: "title", label: "Title" }, { id: "composer", label: "Composer" }],
  rows: [{ title: "Evening Anthem", composer: "Ward" }, { title: "Morning Canticle", composer: "Hale" }, { title: "Psalm Setting", composer: "Ward" }]
};
const summary = (rows: AutomationStudioFlowLessSummary["rows"] = ROWS): AutomationStudioFlowLessSummary => ({
  instructions: "List every piece on my borrowed shelf, with its title and composer.",
  ...(rows ? { rows } : {}),
  acts: [],
  answerText: "Three pieces are on the shelf."
});
const CITED = ROWS!.rows.map((row) => ({ row: String(row.title), column: "composer", value: String(row.composer) }));

/** One diagnosis per call, in order; the last repeats. A `summary` beside a diagnosis's keys is the reply's summary. */
function scriptedInOrder(answers: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const { summary: said, ...answer } = answers[Math.min(seen.length, answers.length - 1)]!;
        seen.push(request);
        return { response: { kind: "diagnosis", summary: typeof said === "string" ? said : "Judged.", diagnosis: answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider, judged: AutomationStudioFlowLessSummary = summary()) => automationStudioFlowLessJudge({
  summary: judged, provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: []
});

/** The run's judge: its words count five on the shelf, its citations match the three rows held. */
const COUNTS_FIVE = { answersRequest: "yes", observed: "The shelf now shows 5 pieces. Recorded rows match the shelf's columns.", checked: CITED, answerRecords: { asked: true, siteShows: 5 } };

describe("a yes on a records request stands on the rows held (t875)", () => {
  it("refuses a yes that counts 5 records on the site over 3 rows, asks once more, and stays unsure with the count leading to the list", async () => {
    const { provider, seen } = scriptedInOrder([COUNTS_FIVE]);
    const judged = await judge(provider);
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toContain("counts 5 records the site shows as the answer, but the result holds 3 rows");
    expect(judged.reason).toContain("The answer is the list the request names");
    // The same refutation came back: not asked a third time.
    expect(seen).toHaveLength(2);
    const again = JSON.stringify(seen[1]?.context.resultSummary);
    expect(again).toContain("counts 5 records the site shows as the answer, but the result holds 3 rows");
    expect(again).toContain("answerRecords");
  });

  it("takes the same judge's yes once, asked again, it cites the rows and counts what the site shows as the rows held", async () => {
    const { provider, seen } = scriptedInOrder([COUNTS_FIVE, { answersRequest: "yes", checked: CITED, answerRecords: { asked: true, siteShows: 3 } }]);
    expect(await judge(provider)).toMatchObject({ verdict: "yes" });
    expect(seen).toHaveLength(2);
    expect(seen[0]?.context.resultSummary).not.toHaveProperty("citationsNotMatched");
  });

  it("takes an honest yes on matching rows in one call", async () => {
    const { provider, seen } = scriptedInOrder([{ answersRequest: "yes", checked: CITED, answerRecords: { asked: true, siteShows: 3 } }]);
    expect(await judge(provider)).toMatchObject({ verdict: "yes", checkedWhat: "3 rows, the model's own answer, against what was asked for." });
    expect(seen).toHaveLength(1);
  });

  it("takes an honest empty result: records asked, the site shows none, no rows held", async () => {
    const empty = { totalRows: 0, truncated: false, columns: ROWS!.columns, rows: [] };
    const { provider, seen } = scriptedInOrder([{ answersRequest: "yes", answerRecords: { asked: true, siteShows: 0 } }]);
    expect(await judge(provider, summary(empty))).toMatchObject({ verdict: "yes" });
    expect(seen).toHaveLength(1);
  });

  it("refuses an empty result the judge counts records for", async () => {
    const empty = { totalRows: 0, truncated: false, columns: ROWS!.columns, rows: [] };
    const { provider } = scriptedInOrder([{ answersRequest: "yes", answerRecords: { asked: true, siteShows: 2 } }]);
    expect((await judge(provider, summary(empty))).reason).toContain("counts 2 records the site shows as the answer, but the result holds 0 rows");
  });

  it("refuses a yes citing no rows on a records result, then takes it once asked again it cites them", async () => {
    const { provider, seen } = scriptedInOrder([{ answersRequest: "yes", answerRecords: { asked: true, siteShows: 3 } }, { answersRequest: "yes", checked: CITED, answerRecords: { asked: true, siteShows: 3 } }]);
    expect(await judge(provider)).toMatchObject({ verdict: "yes" });
    expect(seen).toHaveLength(2);
    expect(JSON.stringify(seen[1]?.context.resultSummary)).toContain("The yes cites no stored row, though the result holds 3 rows");
  });

  it("reads a yes whose answerRecords is malformed as one that said nothing of records: the field is dropped, the verdict stands", async () => {
    const { provider } = scriptedInOrder([{ answersRequest: "yes", checked: CITED, answerRecords: { asked: "yes", siteShows: 3 } }]);
    const judged = await judge(provider);
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toContain("does not say in answerRecords");
  });

  // Lane C's `run-mw4bxkn9-004e2667`: the read stored no rows, and the judge said yes citing rows, its summary saying what was asked could not be judged.
  it("refuses a yes over no rows that cites rows and says it could not judge, leading to where the records are shown", async () => {
    const empty = { totalRows: 0, truncated: false, columns: ROWS!.columns, rows: [] };
    const { provider, seen } = scriptedInOrder([{ answersRequest: "yes", checked: CITED, summary: "There are no rows, so the table itself is not shown and cannot be judged." }]);
    const judged = await judge(provider, summary(empty));
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toContain("The yes cites 3 rows, but the result holds none.");
    expect(judged.reason).toContain("find where the site now shows them and read them into the result");
    expect(judged.reason).toContain("could not be judged from what is here");
    expect(seen).toHaveLength(2);
  });

  it("refuses a yes over no rows that says nothing of records, then takes it once it says the site shows none", async () => {
    const empty = { totalRows: 0, truncated: false, columns: ROWS!.columns, rows: [] };
    const { provider, seen } = scriptedInOrder([{ answersRequest: "yes" }, { answersRequest: "yes", checked: [], answerRecords: { asked: true, siteShows: 0 } }]);
    expect(await judge(provider, summary(empty))).toMatchObject({ verdict: "yes" });
    expect(JSON.stringify(seen[1]?.context.resultSummary)).toContain("The result holds no rows, and the yes does not say in answerRecords");
  });

  it("refuses a yes on matching rows whose own words say it could not judge, and takes the unknown it gives when asked again", async () => {
    const { provider, seen } = scriptedInOrder([
      { answersRequest: "yes", checked: CITED, answerRecords: { asked: true, siteShows: 3 }, observed: "Whether every piece is here cannot be determined." },
      { answersRequest: "unknown", observed: "The shelf itself was not read." }
    ]);
    expect(await judge(provider)).toMatchObject({ verdict: "unsure" });
    expect(seen).toHaveLength(2);
    expect(JSON.stringify(seen[1]?.context.resultSummary)).toContain("could not be judged from what is here");
  });

  it("stays unsure on a yes that keeps citing no rows, saying why", async () => {
    const { provider, seen } = scriptedInOrder([{ answersRequest: "yes" }]);
    const judged = await judge(provider);
    expect(judged.verdict).toBe("unsure");
    expect(judged.reason).toContain("cites no stored row");
    expect(judged.reason).toContain("does not say in answerRecords");
    expect(seen).toHaveLength(2);
  });
});
