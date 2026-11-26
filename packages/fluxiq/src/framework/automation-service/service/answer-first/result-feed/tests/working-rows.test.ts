// A working read reaches the judge with its rows (t1048). Run-mwvgjb8c-5a1f2ae3 read page 1 of a list as a draft step that
// was not the answer, then page 2 as a look, then the cart as the answer. Page 1 held the right row; the judge was told
// page 1 only as `{step, position, listKey, kept: 15}`, saw page 2's dearer row as the cheapest, and said yes.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { automationStudioFlowLessJudge, automationStudioResultEvidenceFromBatches, type AutomationStudioResultEvidenceBundle, type AutomationStudioResultEvidencePage } from "../../../../../../runtime/result-verification/index.ts";
import { readAutomationStudioAnswerFirstResultEvidence } from "../index.ts";
import { resultPipeline } from "./pipeline.ts";

const RESULTS = "list.030ae6af307e2d1035ef1f5d969b";
const CART = "list.00234cc3b485c00862a0418757ae";
const AT = "http://127.0.0.1:63190/shop/search?q=towels&facet=fulfillment_speed%3AToday";
const FIELDS = { title: ".name", price: ".price", rating: ".rating", pickup: ".pickup" };

/** The run's three reads, with its list keys, places, addresses and row counts (steps 0022, 0026, 0040), the item names made generic. */
const PAGE_ONE: JsonObject[] = [...Array.from({ length: 14 }, (_, index) => ({ title: `Pack ${index + 1}`, price: `$${(3 + index).toFixed(2)}`, rating: "4.6", pickup: "Pickup today" })), { title: "Single roll", price: "$1.28", rating: "4.5", pickup: "Pickup today" }];
const PAGE_TWO: JsonObject[] = [...Array.from({ length: 10 }, (_, index) => ({ title: `Bundle ${index + 1}`, price: `$${(7 + index).toFixed(2)}`, rating: "4.5", pickup: "Pickup today" })), { title: "Other single roll", price: "$1.97", rating: "4.6", pickup: "Pickup today" }];
const CART_ROWS: JsonObject[] = [{ title: "Dish soap", price: "$3.97" }, { title: "Other single roll", price: "$1.97" }];

async function recordedRun() {
  const p = resultPipeline("Add the cheapest single item that can be picked up today, rated 4.5 or higher, and give columns title and price.");
  const value = p.input([], FIELDS);
  await p.read({ source: "read_results", value, position: 9, listKey: RESULTS, place: "page=1", rows: PAGE_ONE, extra: { url: AT } });
  await p.read({ source: "read_results_p2", value, kind: "look", listKey: RESULTS, rows: PAGE_TWO, extra: { url: `${AT}&page=2` } });
  await p.read({ source: "read_cart", value: p.input([], { title: ".item", price: ".price" }), position: 15, listKey: CART, place: "offset=0", rows: CART_ROWS, extra: { url: "http://127.0.0.1:63190/shop/cart" } });
  return p;
}

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "unknown", observed: "Scripted." } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const isPage = (entry: AutomationStudioResultEvidenceBundle["working"][number]): entry is AutomationStudioResultEvidencePage => "rows" in entry;

describe("a working read, as the judge is told it", () => {
  it("goes with every row it kept, the qualifying row the answer passed over among them", async () => {
    const p = await recordedRun();
    const evidence = p.feed.evidence();
    expect(evidence.pages.map((page) => page.source)).toEqual(["read_cart"]);
    expect(evidence.working).toHaveLength(1);
    const working = evidence.working[0]!;
    expect(isPage(working)).toBe(true);
    expect(working).toMatchObject({ source: "read_results", step: "read_results", position: 9, listKey: RESULTS, place: "page=1", kept: 15 });
    expect(isPage(working) ? working.rows : []).toContainEqual({ title: "Single roll", price: "$1.28", rating: "4.5", pickup: "Pickup today" });
    expect(evidence.looks[0]?.rows).toContainEqual({ title: "Other single roll", price: "$1.97", rating: "4.6", pickup: "Pickup today" });
  });

  it("reaches the judge's request with both reads' rows: page 1's and page 2's", async () => {
    const p = await recordedRun();
    const { provider, seen } = scripted();
    await automationStudioFlowLessJudge({
      summary: { instructions: "Add the cheapest single item that can be picked up today, rated 4.5 or higher.", rows: { totalRows: 2, truncated: false, columns: [{ id: "title", label: "title" }, { id: "price", label: "price" }], rows: CART_ROWS }, acts: [], resultEvidence: p.feed.evidence() },
      provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: []
    });
    expect(seen).toHaveLength(1);
    const sent = seen[0]!.context.resultSummary?.resultEvidence as unknown as AutomationStudioResultEvidenceBundle;
    const working = sent.working.filter(isPage);
    expect(working.map((page) => page.rows.length)).toEqual([15]);
    expect(working[0]!.rows).toContainEqual(expect.objectContaining({ title: "Single roll", price: "$1.28" }));
    expect(sent.looks[0]!.rows).toContainEqual(expect.objectContaining({ title: "Other single roll", price: "$1.97" }));
    const request = JSON.stringify(seen[0]);
    for (const price of ["$1.28", "$1.97"]) expect(request).toContain(price);
  });

  it("is said by its count while its step has read no page", () => {
    const p = resultPipeline();
    p.feed.draft([p.step("s1", p.input(), 1), p.step("s2", p.input([], { title: ".name" }), 2)]);
    expect(p.feed.evidence().working).toEqual([{ step: "s1", position: 1, kept: 0 }]);
  });

  it("is kept whole in a stored bundle, and an older bundle's count still reads", async () => {
    const p = await recordedRun();
    const stored = JSON.parse(JSON.stringify(p.feed.evidence())) as JsonObject;
    expect(readAutomationStudioAnswerFirstResultEvidence(stored)?.working).toEqual(p.feed.evidence().working);
    const older = { ...stored, working: [{ step: "read_results", position: 9, listKey: RESULTS, kept: 15 }] };
    expect(readAutomationStudioAnswerFirstResultEvidence(older)?.working).toEqual(older.working);
    const page = (stored.working as JsonObject[])[0]!;
    expect(readAutomationStudioAnswerFirstResultEvidence({ ...stored, working: [{ ...page, kept: 3 }] })).toBeUndefined();
    expect(automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ datasetId: "answer", batchKey: "read_cart", evidence: stored }] }).working).toEqual(stored.working);
  });
});
