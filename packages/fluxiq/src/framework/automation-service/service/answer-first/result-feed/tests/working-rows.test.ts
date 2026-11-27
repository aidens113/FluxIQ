// A working read reaches the judge with its rows (t1048). Run-mwvgjb8c-5a1f2ae3 read page 1 of a list as a draft step that
// was not the answer, then page 2 as a look, then the cart as the answer. Page 1 held the right row; the judge was told
// page 1 only as `{step, position, listKey, kept: 15}`, saw page 2's dearer row as the cheapest, and said yes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioLlmProviderError, automationStudioLlmModelLadder, automationStudioLlmRoleRoutedResolution, runAutomationStudioLlmHarness, runWithAutomationStudioLlmModelLadder, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { createAutomationStudioAnthropicProvider } from "../../../../../../runtime/llm/anthropic/index.ts";
import { decisionCall, decisionRequest, toolUseStreamReply, useFixtureModel } from "../../../../../../runtime/llm/anthropic/tests/fixtures.ts";
import { automationStudioFlowLessJudge, automationStudioResultEvidenceFromBatches, type AutomationStudioResultEvidenceBundle, type AutomationStudioResultEvidencePage } from "../../../../../../runtime/result-verification/index.ts";
import { readAutomationStudioAnswerFirstResultEvidence } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
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

  it("reaches a judge that never continues the decider, asked again on its own request after an unreadable reply, rows, ratings and pickup words in it", async () => {
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
    await automationStudioFlowLessJudge({ summary: leftSummary(p), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [] });
    expect(seen).toHaveLength(2);
    expect(seen[1]!.metadata).not.toHaveProperty("continuesDecider");
    expect(seen[1]!.context.resultSummary).toHaveProperty("unreadableReply");
    const sent = seen[1]!.context.resultSummary?.resultEvidence as unknown as AutomationStudioResultEvidenceBundle;
    const working = sent.working.filter(isPage);
    expect(working.map((page) => page.source)).toEqual(["c15", "c50"]);
    expect(working[1]!.rows).toContainEqual(expect.objectContaining({ name: "ValueRidge Essentials Paper Towels, 1 Roll", price: "$1.28", rating: "4.5", pickup: "Pickup today" }));
    const request = JSON.stringify(seen[1]!.context.resultSummary);
    expect(request.split("Pickup today").length - 1).toBeGreaterThanOrEqual(8);
  });
});

// Since t1065 a continuing judge's unreadable reply is answered in its own conversation: the continuation's request again,
// the reply, a tool result and the ask. The left reads ride in the judge's summary, so they must be in that re-ask too.
// The real Anthropic adapter, routing, harness and Flow-less judge run over a scripted fetch, as t1065's own test does
// (`runtime/result-verification/flow-less/tests/judge-tool-call-answered.test.ts`); no model is called.
describe("a read that left the draft, asked of a continuing judge again in its own conversation", () => {
  const MODEL = "claude-sonnet-5-5";
  const DECISION = { kind: "evidence_tool_decision", summary: "Read the list.", decision: { kind: "tool_call", callId: "call.4", toolId: "core.inspect_values", input: { parameters: { list: { name: "results" } } } } };
  const ANSWER = { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "unknown", observed: "Scripted.", defects: [], checked: [], answerRecords: { asked: true } } };
  type Wire = { messages: { role: string; content: string | Array<{ type: string; text?: string; content?: unknown }> }[] };
  beforeEach(() => useFixtureModel(MODEL));
  afterEach(() => useFixtureModel("claude-haiku-5-5"));

  it("is in the request the in-conversation re-ask sends, rows, ratings and pickup words in it", async () => {
    const p = await leftRun();
    const sent: Wire[] = [];
    const replies = [
      () => toolUseStreamReply([decisionCall(DECISION)]),
      // 0060's shape: prose, then a call of a decision tool.
      () => toolUseStreamReply([{ name: decisionCall(DECISION).name, input: { summary: "placeholder" } }], "tool_use", undefined, "The single roll is the cheapest that qualifies."),
      () => toolUseStreamReply([{ name: "core_check_answer", input: ANSWER }], "tool_use")
    ];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)) as Wire);
      return replies[sent.length - 1]!();
    });
    const resolver = async (input: { modelId?: string }) => ({ provider: createAutomationStudioAnthropicProvider({ model: input.modelId ?? MODEL, secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as unknown as typeof fetch }) });
    const provider = (await automationStudioLlmRoleRoutedResolution(resolver, { projectId: "project-1", flowId: "flow-1", modelId: MODEL }))!.provider;
    const decider = decisionRequest();
    decider.deniedEvidenceKeys = [];
    await runWithAutomationStudioLlmModelLadder(automationStudioLlmModelLadder(), async () => {
      await provider.runTask(decider);
      return await automationStudioFlowLessJudge({ summary: leftSummary(p), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [], continuesDecider: true, tokenLimits: { maxInputTokens: 900_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 } });
    });
    expect(sent).toHaveLength(3);
    const [, continuing, answered] = sent as [Wire, Wire, Wire];
    // The re-ask is the continuation's request again, then the reply and the answer to it: nothing of the judge's message is lost.
    expect(JSON.stringify(answered.messages.slice(0, continuing.messages.length))).toBe(JSON.stringify(continuing.messages));
    expect(answered.messages.at(-1)!.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "tool_result" })]));
    const asked = JSON.stringify(answered.messages);
    for (const words of ["ValueRidge Essentials Paper Towels, 1 Roll", "c15", "c50"]) expect(asked).toContain(words);
    expect(asked.split("Pickup today").length - 1).toBeGreaterThanOrEqual(8);
  });
});

/** What the judge is asked about at 0101: the cart's rows as the answer, and the feed's evidence, left reads and all. */
function leftSummary(p: Awaited<ReturnType<typeof leftRun>>) {
  return { instructions: LEFT_INSTRUCTION, rows: { totalRows: 2, truncated: false, columns: [{ id: "item", label: "item" }, { id: "quantity", label: "quantity" }, { id: "price", label: "price" }], rows: LEFT_CART_ROWS }, acts: [], resultEvidence: p.feed.evidence() };
}

// Which read is the result, said the same by the draft and the header, and the rows a read took kept with it when it
// comes back into the draft (`../returned-pages.ts`, `../feed.ts`, t1085). Live run `run-mwz2jc4w-0c207128`, attempt 2:
// the read of 0057 became step 14 with page=1's 26 rows; the draft left it out, then 0058 kept it and made it the
// result, and the header said "step 14 (v1: no conditions), 0 rows: v1 has read no page yet".

const K3_LIST = "list.1232f628ba511b1e44ec00602195";
const K3_WHERE = "http://127.0.0.1:52619/scenarios/auction-marketplace/sch/i.html?_nkw=kestrel+35&LH_Auction=1";
const K3_PAGE_ONE: JsonObject[] = Array.from({ length: 26 }, (_, index) => ({ title: `Lot ${index + 1}`, price: `£${index + 10}.00` }));

async function k3Read14() {
  const p = resultPipeline("List the auctions and give columns title and price.");
  const value = p.input();
  await p.read({ source: "read4", value, position: 14, listKey: K3_LIST, place: "page=1", rows: K3_PAGE_ONE, extra: { url: K3_WHERE } });
  const step = (rest: Partial<AutomationStudioFlowDraftStep>): AutomationStudioFlowDraftStep => ({ ...p.step("read4", value, 14), ...rest });
  return { p, value, step };
}

describe("a read step that leaves the draft and comes back", () => {
  it("run mwz2jc4w 0058: step 14 kept and made the result holds page=1's 26 rows again", async () => {
    const { p, step } = await k3Read14();
    expect(p.feed.rows().totalRows).toBe(26);
    p.feed.draft([step({ disposition: "taken", drafted: "not_the_result" })]);
    expect(p.feed.rows().totalRows).toBe(0);
    expect(p.feed.slot()).toContain("step 14 left the draft");
    p.feed.draft([step({ result: true })]);
    expect(p.feed.rows().totalRows).toBe(26);
    expect(p.feed.port.header()).toContain("step 14 (v1: no conditions), 26 rows over 1 page: page=1 (26)");
    expect(p.feed.port.header()).not.toContain("has read no page yet");
    expect(p.feed.evidence().pages.map((page) => page.source)).toEqual(["read4"]);
    expect(p.feed.evidence().working).toEqual([]);
  });

  it("comes back with no page where it now reads another way: those rows were read under the old reading", async () => {
    const { p, step, value } = await k3Read14();
    p.feed.draft([step({ disposition: "taken" })]);
    const other = { ...value, parameters: { read: { fields: { title: ".name", price: ".price", bids: ".bids" }, where: [] } } };
    p.feed.draft([step({ input: other })]);
    expect(p.feed.rows().totalRows).toBe(0);
    expect(p.feed.port.header()).toContain("has read no page yet");
    expect(p.feed.evidence().working.map((entry) => ("source" in entry ? entry.source : undefined))).toEqual(["read4"]);
  });

  it("comes back with no page another step has read again since, at the same address of the same list (t1074)", async () => {
    const { p, step, value } = await k3Read14();
    p.feed.draft([step({ disposition: "taken" })]);
    await p.read({ source: "read5", value, position: 15, listKey: K3_LIST, place: "page=1", rows: K3_PAGE_ONE.slice(0, 20), extra: { url: K3_WHERE } });
    p.feed.draft([step({}), { ...p.step("read5", value, 15) }]);
    expect(p.feed.evidence().pages.map((page) => page.source)).toEqual(["read5"]);
  });
});

describe("a result read carried from an earlier attempt that has read nothing here", () => {
  it("run mwz2jc4w 0052: the header names it, as the draft does, and not 'no read step'", () => {
    const p = resultPipeline("List the auctions and give columns title and price.");
    const carried = { ...p.step("d6", { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.1" } } }, 6), result: true as const };
    p.feed.draft([carried]);
    const header = p.feed.port.header();
    expect(header).not.toContain("the draft has no read step yet");
    expect(header).toContain("step 6");
    expect(header).toContain("has read no page yet");
  });
});
