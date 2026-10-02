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
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tools = [
  { toolId: "read", description: "Read the list, every page.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];
const CHEAP_PER_PAGE = [4, 3, 3, 3, 0];

/** The results site. `reset` is a replay's `{ replay: "reset", from }`; `unreachable` makes every reset fail. */
function site(options: { unreachable?: boolean; noReplay?: boolean } = {}) {
  let page = 1;
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

const loop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof site>) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool, maxIterations: 12, maxToolCalls: 12, dryRun: false, propagateDecisionErrors: true, unusableDecisions: { maxConsecutive: 8, stalled: () => new Error("stalled") }
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
