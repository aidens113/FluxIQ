// Rows that cannot be the table the request names are refused before any judge is paid for (t1034). The recorded shape
// (bigbox run run-mwveg5ls-0266dfe0, every one of its 11 judge calls): the request ends "show me my basket as a table
// with columns item, quantity and price", two acts are on the record, and the result is one row of a search-results read
// with columns name, price, rating and pickup. The site is made up (a garden shop), as is every row.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { AutomationStudioFlowLessJudgement } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, automationStudioAnswerFirstCompletionCheck } from "../index.ts";
import { automationStudioAnswerFirstNotAskedTable } from "../asked-table.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const ASKED = "Choose Elm Row as my shop, add the cheapest seed tray rated 4 stars or more that is ready to collect today to my basket, keep the trowel already in it, and do not pay. Then show me my basket as a table with columns item, quantity and price.";
const SEARCH = [{ id: "name", label: "Name" }, { id: "price", label: "Price" }, { id: "rating", label: "Rating" }, { id: "pickup", label: "Pickup" }];
const searchRow: JsonObject[] = [{ name: "Fernway Seed Tray, 24 Cells", price: "$4.10", rating: "4.5", pickup: "Collect today" }];
const BASKET = [{ id: "item", label: "Item" }, { id: "quantity", label: "Quantity" }, { id: "price", label: "Price" }];
const basketRows: JsonObject[] = [{ item: "Fernway Seed Tray, 24 Cells", quantity: "1", price: "$4.10" }, { item: "Steel Trowel", quantity: "1", price: "$6.00" }];
const ACTS = [{ act: "a1" }, { act: "a2" }] as unknown as AutomationStudioAttemptAct[];
const NO: AutomationStudioFlowLessJudgement = { verdict: "no", reason: "The cheapest qualifying tray was not established.", checkedWhat: "the basket" };

function made(columns: { id: string; label: string }[], rows: JsonObject[], judged: number[], said: string[] = []) {
  return automationStudioAnswerFirstCompletionCheck({
    instructions: ASKED,
    rows: async () => ({ datasetId: "dataset.1", totalRows: rows.length, truncated: false, columns, rows }),
    acts: () => ACTS,
    readsRan: () => true,
    endView: async () => undefined,
    witnesses: () => ({}),
    judge: async () => {
      judged.push(1);
      return NO;
    },
    purse,
    say: (title) => said.push(title)
  });
}

describe("the recorded shape: a search read held as the result of a request for a basket table", () => {
  it("is refused with no judge, saying the table is a list of its own, detected where it stands", async () => {
    const judged: number[] = [];
    const said: string[] = [];
    const check = made(SEARCH, searchRow, judged, said);
    const answer = await check.check({ summary: "Shop chosen and the tray added." });
    if (answer.ok) throw new Error("It should have been refused.");
    expect(judged).toHaveLength(0);
    expect(answer.issueCodes).toEqual(["answer_first.not_asked_table"]);
    expect(check.state.timesChecked).toBe(0);
    expect(said).toEqual(["Not there yet"]);
    const words = String(answer.feedback.instruction);
    expect(words).toContain("the request names the columns of the table it asks for (item, quantity, price), and the rows the result holds have no item or quantity column");
    expect(words).toContain("The table asked for is a list of its own: a list is detected where it stands, on the page that shows it, and read through the handle that detection issues, so a read through a handle from another page or another list returns that other list, or nothing, and never the table asked for");
    expect(words).toContain("go to the page that shows it, detect its list there, and read it through the handle that detection issues");
    // Model-facing words name no site, shop, item or value.
    for (const word of ["Elm Row", "Fernway", "tray", "basket", "trowel", "$"]) expect(words.includes(word)).toBe(false);
  });

  it("counts the same rows again as the same evidence, still with no judge", async () => {
    const judged: number[] = [];
    const check = made(SEARCH, searchRow, judged);
    await check.check({ summary: "First." });
    const again = await check.check({ summary: "Second, reworded." });
    if (again.ok) throw new Error("It should have been refused.");
    expect(again.issueCodes).toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
    expect(check.state.refusedAgain).toBe(1);
    expect(judged).toHaveLength(0);
  });

  it("asks the judge once the rows are the table asked for: it still has the cheapest item to decide", async () => {
    const judged: number[] = [];
    const answer = await made(BASKET, basketRows, judged).check({ summary: "Basket read." });
    expect(judged).toHaveLength(1);
    expect(answer.ok ? [] : answer.issueCodes).toEqual(["answer_first.judged_no"]);
  });

  it("leaves a result with no rows, and a request naming no columns, to the judge", () => {
    expect(automationStudioAnswerFirstNotAskedTable(ASKED, { datasetId: "dataset.1", totalRows: 0, truncated: false, columns: SEARCH, rows: [] })).toBeUndefined();
    expect(automationStudioAnswerFirstNotAskedTable("Show me my basket.", { datasetId: "dataset.1", totalRows: 1, truncated: false, columns: SEARCH, rows: searchRow })).toBeUndefined();
    expect(automationStudioAnswerFirstNotAskedTable(ASKED, { datasetId: "dataset.1", totalRows: 1, truncated: false, columns: SEARCH, rows: searchRow })).toEqual({ asked: ["item", "quantity", "price"], lacking: ["item", "quantity"] });
  });
});
