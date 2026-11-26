// A working read reaches the judge with its rows (t1048). Run-mwvgjb8c-5a1f2ae3 read page 1 of a list as a draft step that
// was not the answer, then page 2 as a look, then the cart as the answer. Page 1 held the right row; the judge was told
// page 1 only as `{step, position, listKey, kept: 15}`, saw page 2's dearer row as the cheapest, and said yes.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioLlmProviderError, runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
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

// Every read that ran reaches the judge, whether or not the draft kept it (t1067). Live run run-mwy3btww-31d32e0d read the
// Pickup list with rating and pickup columns twice, c15 (step 0082) and c50 (step 0100), 15 rows each, the right single roll
// among them; the framework draft dropped both as not the result (t1037), and every judge asked on its own request after an
// unreadable reply saw "Pickup today" 0 times. The rows below are the first four of c50's, as the recording holds them.
const LEFT_LIST = "list.030ae6af307e2d1035ef1f5d969b";
const LEFT_AT = "http://127.0.0.1:53575/scenarios/bigbox-retail/search?q=paper+towels&facet=fulfillment_method%3APickup&sort=price_low";
const CANDIDATE_FIELDS = { name: "text_5", price: "div_price", rating: "div_rating", pickup: "text_8" };
const CANDIDATES: JsonObject[] = [
  { name: "ValueRidge Essentials Paper Towels, 1 Roll", price: "$1.28", rating: "4.5", pickup: "Pickup today" },
  { name: "Loftwell Select-A-Size Paper Towels, 12 Double Rolls", price: "$19.94", rating: "4.7", pickup: "Pickup today" },
  { name: "Loftwell Paper Towels, 1 Roll", price: "$1.97", rating: "4.6", pickup: "Pickup today" },
  { name: "Hearthside Kitchen Paper Towels, 2 Rolls", price: "$2.97", rating: "4.3", pickup: "Pickup today" }
];
const LEFT_CART_ROWS: JsonObject[] = [
  { item: "ValueRidge Ultra Dish Soap, Lemon Scent, 24 fl oz", quantity: "1", price: "$3.97" },
  { item: "ValueRidge Essentials Paper Towels, 1 Roll", quantity: "1", price: "$1.28" }
];
const LEFT_INSTRUCTION = "Find the lowest-priced paper towels this store can have ready for pickup today, rated 4.5 stars or higher, add one to my cart, and show me my cart as a table with columns item, quantity and price.";

/** The run as the ledger met it by step 0101: the cart read (c10), then c15 and c50, each added and then dropped by the draft. */
async function leftRun() {
  const p = resultPipeline(LEFT_INSTRUCTION);
  const cart = p.input([], { item: ".item", quantity: ".qty", price: ".price" });
  const candidates = p.input([], CANDIDATE_FIELDS);
  await p.read({ source: "c10", value: cart, position: 13, listKey: CART, place: "offset=0", rows: LEFT_CART_ROWS, extra: { url: "http://127.0.0.1:53575/scenarios/bigbox-retail/cart" } });
  for (const source of ["c15", "c50"]) {
    await p.read({ source, value: candidates, position: 21, listKey: LEFT_LIST, place: "page=1", rows: CANDIDATES, extra: { url: LEFT_AT } });
    // The framework draft keeps only the result's read: the candidate read leaves (0083, 0101).
    p.feed.draft([p.step("c10", cart, 13)]);
  }
  return p;
}


describe("a read that left the draft, as the judge is told it", () => {
  it("stays among the working reads with every row it kept, under the step and version it was read under", async () => {
    const p = await leftRun();
    const evidence = p.feed.evidence();
    expect(evidence.pages.map((page) => page.source)).toEqual(["c10"]);
    const working = evidence.working.filter(isPage);
    expect(working.map((page) => page.source)).toEqual(["c15", "c50"]);
    for (const page of working) {
      expect(page).toMatchObject({ step: page.source, version: 1, listKey: LEFT_LIST, place: "page=1", kept: 4 });
      expect(page).not.toHaveProperty("position");
      expect(page.rows).toContainEqual({ name: "ValueRidge Essentials Paper Towels, 1 Roll", price: "$1.28", rating: "4.5", pickup: "Pickup today" });
    }
    // A stored bundle reads back whole.
    expect(readAutomationStudioAnswerFirstResultEvidence(JSON.parse(JSON.stringify(evidence)))?.working).toEqual(evidence.working);
  });

  it("is not kept again when its page is read again at its place under the same step and version", async () => {
    const p = resultPipeline(LEFT_INSTRUCTION);
    const candidates = p.input([], CANDIDATE_FIELDS);
    await p.read({ source: "r1", value: candidates, position: 1, listKey: LEFT_LIST, place: "page=1", rows: CANDIDATES });
    await p.read({ source: "r2", value: candidates, kind: "rerun", id: "r1", position: 1, listKey: LEFT_LIST, place: "page=1", rows: CANDIDATES.slice(0, 2) });
    const evidence = p.feed.evidence();
    expect(evidence.pages.map((page) => page.source)).toEqual(["r2"]);
    expect(evidence.working).toEqual([]);
  });

  it("goes back to the step when a step holds its page again, and is not said twice", async () => {
    const p = await leftRun();
    const candidates = p.input([], CANDIDATE_FIELDS);
    // The draft takes c50's step back (`take` is for looks; a draft that lists it again holds its read again).
    p.feed.draft([p.step("c10", p.input([], { item: ".item", quantity: ".qty", price: ".price" }), 13), p.step("c50", candidates, 14)]);
    await p.read({ source: "c50", value: candidates, kind: "rerun", id: "c50", position: 14, listKey: LEFT_LIST, place: "page=1", rows: CANDIDATES });
    const evidence = p.feed.evidence();
    const shown = [...evidence.pages, ...evidence.working.filter(isPage)].map((page) => page.source);
    expect(shown.filter((source) => source === "c50")).toHaveLength(1);
    // c50's step, last in the draft, is the result now; the cart's step is a working step of the draft, and c15 stays gone.
    expect(evidence.pages.map((page) => page.source)).toEqual(["c50"]);
    expect(evidence.working.filter(isPage).map((page) => page.source)).toEqual(["c10", "c15"]);
  });

  it("reaches the judge asked on its own request after an unreadable reply, rows, ratings and pickup words in it", async () => {
    const p = await leftRun();
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "claude-sonnet-5-5" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        if (seen.length === 1) throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200, undefined, undefined, undefined, { case: "content_prefixed" });
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "unknown", observed: "Scripted." } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    };
    await automationStudioFlowLessJudge({
      summary: { instructions: LEFT_INSTRUCTION, rows: { totalRows: 2, truncated: false, columns: [{ id: "item", label: "item" }, { id: "quantity", label: "quantity" }, { id: "price", label: "price" }], rows: LEFT_CART_ROWS }, acts: [], resultEvidence: p.feed.evidence() },
      provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [], continuesDecider: true
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]!.metadata).toMatchObject({ judgeStandaloneAfterUnreadable: true });
    const sent = seen[1]!.context.resultSummary?.resultEvidence as unknown as AutomationStudioResultEvidenceBundle;
    const working = sent.working.filter(isPage);
    expect(working.map((page) => page.source)).toEqual(["c15", "c50"]);
    expect(working[1]!.rows).toContainEqual(expect.objectContaining({ name: "ValueRidge Essentials Paper Towels, 1 Roll", price: "$1.28", rating: "4.5", pickup: "Pickup today" }));
    const request = JSON.stringify(seen[1]!.context.resultSummary);
    expect(request.split("Pickup today").length - 1).toBeGreaterThanOrEqual(8);
  });
});
