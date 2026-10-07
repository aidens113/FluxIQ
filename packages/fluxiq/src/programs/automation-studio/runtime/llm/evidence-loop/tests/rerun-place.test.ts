// A rerun runs from the page its step started on (`../../node-tools/step-place.ts`).
//
// Lane C's runs 11 and 12 (t194, earbuds): a list read paginated from page 1
// to page 5 and left the page there, and every rerun of it -- the model
// correcting its filter -- ran on page 5, read one page of 11 items that the
// filter rejected, and answered those 11 unfiltered: 0 of 13 rows. The fake
// site below is that shape: five pages of 11 items, 13 cheap ones on pages 1-4
// and none on page 5, and a read that pages to the end, keeping what its
// filter keeps or, when it keeps nothing, returning the page unfiltered.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tools = [
  { toolId: "read", description: "Read the list, every page.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];
const CHEAP_PER_PAGE = [4, 3, 3, 3, 0];

/** The results site. `reset` is a replay's `{ replay: "reset", from }`; `unreachable` makes every reset fail. */
function site(options: { unreachable?: boolean; noReplay?: boolean; startAt?: number } = {}) {
  let page = options.startAt ?? 1;
  const result = (fields: JsonObject, before: number) => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: `p${before}`, after: `p${page}` }, ...fields });
  return vi.fn(async ({ toolId, value }: { callId?: string; toolId: string; value: JsonObject }) => {
    const before = page;
    if (value.replay === "reset") {
      const location = (value.from as JsonObject | undefined)?.location;
      if (options.unreachable || typeof location !== "string") return { kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false, resultCode: "core.replay.reset_failed" };
      page = Number(location.slice(1));
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    }
    if (toolId === "press") {
      page = 1;
      return result({ evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", draft: { actionId: "web.click", effect: "mutate", proposes: true } }, before);
    }
    const pages = CHEAP_PER_PAGE.slice(page - 1);
    const kept = value.where ? pages.reduce((sum, cheap) => sum + cheap, 0) : 0;
    page = 5;
    const rows = kept || 11;
    return result({
      evidence: { rows, unfiltered: kept === 0, pagesRead: pages.length },
      effectApplied: true,
      resultCode: "web.inspect.succeeded",
      draft: { actionId: "web.read", effect: "observe", proposes: true, ...(options.noReplay ? {} : { replay: { from: { location: `p${before}` }, produced: { records: rows } } }) }
    }, before);
  });
}

const loop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof site>, draft?: { seed: AutomationStudioFlowDraftStep[]; seedStartedOn?: Record<string, JsonObject> }) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool, maxIterations: 12, maxToolCalls: 12, dryRun: false, propagateDecisionErrors: true, unusableDecisions: { maxConsecutive: 8, stalled: () => new Error("stalled") },
  ...(draft ? { draft } : {})
});
const read = { kind: "tool_call", callId: "read.1", toolId: "read", input: { list: "results" }, add: true };
const rerun = (where: string) => ({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { where } }] });
type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;

describe("a rerun of a read that paged to the end", () => {
  it("runs from the step's own first page, and reads the 13 rows the filter keeps rather than page 5's 11 unfiltered", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(read)
      .mockResolvedValueOnce(rerun("price < 50"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });

    const calls = executeTool.mock.calls.map(([call]) => [call.callId, call.value]);
    expect(calls).toEqual([
      ["read.1", { list: "results" }],
      ["rerun.1.place", { replay: "reset", from: { location: "p1" } }],
      ["rerun.1", { list: "results", where: "price < 50" }]
    ]);
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ rows: 13, unfiltered: false, pagesRead: 5 });
  });

  it("before the fix the same rerun read page 5 alone: the reset is what makes the difference", async () => {
    const executeTool = site();
    await executeTool({ toolId: "read", value: { list: "results" } });
    const fromWhereItWasLeft = await executeTool({ toolId: "read", value: { list: "results", where: "price < 50" } });
    expect(fromWhereItWasLeft).toMatchObject({ evidence: { rows: 11, unfiltered: true, pagesRead: 1 } });
  });

  it("runs where it is, with no reset, when the page is still the one the step started on", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(read)
      .mockResolvedValueOnce({ kind: "tool_call", callId: "back.1", toolId: "press", input: { target: "First page" } })
      .mockResolvedValueOnce(rerun("price < 50"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool.mock.calls.map(([call]) => call.callId)).toEqual(["read.1", "back.1", "rerun.1"]);
  });

  it("runs nothing when the step's page cannot be put back, and says why", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(read)
      .mockResolvedValueOnce(rerun("price < 50"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site({ unreachable: true });

    await loop(decide, executeTool).catch(() => undefined);

    expect(executeTool.mock.calls.map(([call]) => call.callId)).toEqual(["read.1", "rerun.1.place"]);
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ ok: false, code: "rerun_place_unreachable" });
  });

  // Live run `run-muqk713g` (C6): every re-author rerun of the Flow's read ran on results page 5, where the refuted
  // run left the page, and nothing told the model so. A rerun's answer now says where it ran.
  it("says in the rerun's answer that it ran where the page is when nothing recorded where its step started", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(read)
      .mockResolvedValueOnce(rerun("price < 50"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site({ noReplay: true });

    await loop(decide, executeTool).catch(() => undefined);

    expect(executeTool.mock.calls.map(([call]) => call.callId)).toEqual(["read.1", "rerun.1"]);
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ rows: 11, unfiltered: true, rerunPlace: { place: "in_place", reason: "start_page_unknown" } });
  });

  it("says in the rerun's answer that it put the page back to where its step started", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(read)
      .mockResolvedValueOnce(rerun("price < 50"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site();

    await loop(decide, executeTool).catch(() => undefined);

    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ rows: 13, rerunPlace: { place: "put_back", startPage: "step" } });
  });
});

// Live run `run-murwcmx2-a1c6edf7` (t194, cause C-D): after the judge refuted
// the saved Flow's answer, the re-author's `amend_draft rerun step 7` -- the
// Flow's list read, with a relaxed condition -- ran on results page 5, where the
// refuted run had left the page: "11 records from 1 page". A step carried from
// the Flow records no `replay.from`, so the loop is handed where its node
// started in the refuted run (`seedStartedOn`) and puts the page back there.
describe("a re-author's rerun of the Flow's read, carried from the Flow", () => {
  /** The Flow's read, as `node-tools/draft-from-flow.ts` seeds it: no call, no replay. */
  const carried: AutomationStudioFlowDraftStep = {
    position: 1, id: "f1", iteration: 0, actionId: "web.read", toolId: "read", input: { list: "results" }, effect: "observe", proposes: true, disposition: "kept"
  };
  const decided = () => vi.fn()
    .mockResolvedValueOnce(rerun("price < 50"))
    .mockResolvedValueOnce({ kind: "complete", result: { done: true } });

  it("puts the page back where the read started in the refuted run before it runs, and reads the 13 rows", async () => {
    const decide = decided();
    const executeTool = site({ startAt: 5 });

    await loop(decide, executeTool, { seed: [carried], seedStartedOn: { f1: { location: "p1" } } }).catch(() => undefined);

    expect(executeTool.mock.calls.map(([call]) => [call.callId, call.value])).toEqual([
      ["rerun.1.place", { replay: "reset", from: { location: "p1" } }],
      ["rerun.1", { list: "results", where: "price < 50" }]
    ]);
    const answered = shownAt(decide, 1).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ rows: 13, unfiltered: false, pagesRead: 5, rerunPlace: { place: "put_back", startPage: "seeded_run" } });
  });

  it("runs where the page is, and says so, when the refuted run recorded no start page for it", async () => {
    const decide = decided();
    const executeTool = site({ startAt: 5 });

    await loop(decide, executeTool, { seed: [carried], seedStartedOn: {} }).catch(() => undefined);

    expect(executeTool.mock.calls.map(([call]) => call.callId)).toEqual(["rerun.1"]);
    const answered = shownAt(decide, 1).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ rows: 11, unfiltered: true, rerunPlace: { place: "in_place", reason: "start_page_unknown" } });
  });

  it("puts the page back for a rerun of a step that stood in for the carried read without a start page of its own", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(rerun("price < 60"))
      .mockResolvedValueOnce(rerun("price < 50"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site({ startAt: 5, noReplay: true });

    await loop(decide, executeTool, { seed: [carried], seedStartedOn: { f1: { location: "p1" } } }).catch(() => undefined);

    expect(executeTool.mock.calls.map(([call]) => [call.callId, call.value.replay ?? null])).toEqual([
      ["rerun.1.place", "reset"],
      ["rerun.1", null],
      ["rerun.1.2.place", "reset"],
      ["rerun.1.2", null]
    ]);
  });
});

// t193 lane B, `run-muqiojz4-04a7a8fc` (bigbox cart): a rerun of Add to cart
// reset the towel page to its address, which took back the "+" before it, so
// the rerun added one towel where the Flow adds two. The put-back now does the
// proposed steps that started on that page again, in order, before the rerun
// (`../../node-tools/step-place.ts`).
describe("a rerun of a step that built on the press before it on the same page", () => {
  /** The towel page: an address, a swatch, a quantity and a cart; a reset puts back the address alone. */
  function towels() {
    const page = { at: "towels", swatch: "", quantity: 1, cart: 0 };
    const state = () => `${page.at}|${page.swatch}|q${page.quantity}|c${page.cart}`;
    const press = (target: string) => {
      if (target === "Blue") page.swatch = "blue";
      if (target === "+") page.quantity += 1;
      if (target === "Add to cart") page.cart += page.quantity;
      if (target === "Cart") page.at = "cart";
    };
    const executeTool = vi.fn(async ({ value }: { callId?: string; toolId: string; value: JsonObject }) => {
      if (value.replay === "reset") {
        page.at = String((value.from as JsonObject).location);
        page.swatch = "";
        page.quantity = 1;
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      }
      const target = String(value.target);
      if (value.replay === "step") {
        press(target);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      }
      const before = state();
      const from = page.at;
      press(target);
      return {
        kind: "llm_evidence_tool_execution",
        stateDigests: { before, after: state() },
        evidence: { ok: true, pressed: target, quantity: page.quantity, cart: page.cart },
        effectApplied: true,
        resultCode: "web.action.succeeded",
        draft: { actionId: "web.click", effect: "mutate", proposes: true, ranWith: { target }, replay: { from: { location: from } } }
      };
    });
    return { page, executeTool };
  }
  const pressing = (callId: string, target: string) => ({ kind: "tool_call", callId, toolId: "press", input: { target }, add: true });

  it("does the swatch and the \"+\" again before the rerun, so it adds two towels and not one", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressing("blue.1", "Blue"))
      .mockResolvedValueOnce(pressing("plus.1", "+"))
      .mockResolvedValueOnce(pressing("add.1", "Add to cart"))
      .mockResolvedValueOnce(pressing("cart.1", "Cart"))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 3, change: "rerun", input: { target: "Add to cart" } }] })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const host = towels();

    await expect(loop(decide, host.executeTool)).resolves.toMatchObject({ ok: true });

    expect(host.executeTool.mock.calls.map(([call]) => [call.callId, call.value.replay ?? null, call.value.target ?? null])).toEqual([
      ["blue.1", null, "Blue"],
      ["plus.1", null, "+"],
      ["add.1", null, "Add to cart"],
      ["cart.1", null, "Cart"],
      ["rerun.3.place", "reset", null],
      ["rerun.3.place.1", "step", "Blue"],
      ["rerun.3.place.2", "step", "+"],
      ["rerun.3", null, "Add to cart"]
    ]);
    const answered = shownAt(decide, 5).find((entry) => entry.callId === "rerun.3")?.value;
    expect(answered).toMatchObject({ pressed: "Add to cart", quantity: 2, cart: 4 });
  });
});

// Live run `run-mux6naez-6c20f26e` (lane C, R3-3): the build's test was judged
// wrong, and Core's check said the read's condition "name" alone left out three
// pairs of earbuds. The repair's first rerun of that read kept all three; its
// answer said only how many rows it read, and the model reran the same read six
// more times instead of completing. A rerun of a read in a repair whose
// judgement names rows now answers which of them it keeps.
describe("a rerun of the read a judged test blamed", () => {
  const NAMED = ["Lumo Audio Drift Pro", "Aurelle Pods Fit (Ivory with Wireless Charging Case)", "Trevio T5"];
  const OTHERS = Array.from({ length: 10 }, (_, index) => `Earbuds model ${index + 1}`);
  const judgement = { judge: { verdict: "no", findings: [], checked: [`Step 9: the condition "name" alone left out these rows the check names: ${NAMED.join("; ")}.`], checkedRows: [{ step: 9, condition: "name", rows: NAMED.map((label) => ({ label })) }] } };
  /** A live read's answer: its kept records, each led by its name, then an address. */
  const records = (names: readonly string[]) => names.map((name, index) => ({ name, url: `https://shop.test/p/${index}` }));
  function host(rerunKeeps: readonly string[]) {
    return vi.fn(async ({ value }: { callId?: string; toolId: string; value: JsonObject }) => {
      if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      const kept = value.where ? rerunKeeps : OTHERS;
      return {
        kind: "llm_evidence_tool_execution", stateDigests: { before: "p1", after: "p1" },
        evidence: { said: `${kept.length} records`, read: { extracted: records(kept) } }, effectApplied: true, resultCode: "web.inspect.succeeded",
        draft: { actionId: "web.read", effect: "observe", proposes: true, replay: { from: { location: "p1" } } }
      };
    });
  }
  const repair = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof host>) => runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool, maxIterations: 12, maxToolCalls: 12, dryRun: false, propagateDecisionErrors: true, unusableDecisions: { maxConsecutive: 8, stalled: () => new Error("stalled") },
    // Where the domain declares a live read keeps its records (the web domain's `read.extracted`): Core names no domain's key.
    readRowsKey: "read.extracted",
    draft: { seed: [], resume: { revision: 2, stopped: "judged_wrong", outstandingIssueCodes: [], judgement } }
  });
  const decisions = () => vi.fn()
    .mockResolvedValueOnce(read)
    .mockResolvedValueOnce(rerun("name not contains replacement"))
    .mockResolvedValueOnce({ kind: "complete", result: { done: true } });

  it("says every row the check named is kept now, and to complete so the Flow is tested again", async () => {
    const decide = decisions();
    await expect(repair(decide, host([...OTHERS, ...NAMED]))).resolves.toMatchObject({ ok: true });
    const shown = shownAt(decide, 2);
    expect(shown.find((entry) => entry.callId === "read.1")?.value).not.toHaveProperty("checkedRowsNow");
    const answered = shown.find((entry) => entry.callId === "rerun.1")?.value as { checkedRowsNow?: { kept: string[]; stillLeftOut: string[]; said: string } } | undefined;
    expect(answered?.checkedRowsNow?.kept).toEqual(NAMED);
    expect(answered?.checkedRowsNow?.stillLeftOut).toEqual([]);
    expect(answered?.checkedRowsNow?.said).toContain("complete, so the Flow is tested again");
  });

  it("compares nothing when the domain declared no place for a live read's kept rows", async () => {
    const decide = decisions();
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: host([...OTHERS, ...NAMED]), maxIterations: 12, maxToolCalls: 12, dryRun: false, propagateDecisionErrors: true, unusableDecisions: { maxConsecutive: 8, stalled: () => new Error("stalled") },
      draft: { seed: [], resume: { revision: 2, stopped: "judged_wrong", outstandingIssueCodes: [], judgement } }
    })).resolves.toMatchObject({ ok: true });
    expect(shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value).not.toHaveProperty("checkedRowsNow");
  });

  it("names the row the rerun still leaves out, and does not say to complete", async () => {
    const decide = decisions();
    await expect(repair(decide, host([...OTHERS, ...NAMED.slice(0, 2)]))).resolves.toMatchObject({ ok: true });
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value as { checkedRowsNow?: { kept: string[]; stillLeftOut: string[]; said: string } } | undefined;
    expect(answered?.checkedRowsNow?.stillLeftOut).toEqual(["Trevio T5"]);
    expect(answered?.checkedRowsNow?.said).not.toContain("complete");
  });
});
