// Looks with nothing done between them (`../../repeat-guard/searching.ts`,
// `../../decision-handlers/searching.ts`), and a look that answered the same
// twice on one page (`../../repeat-guard/outcomes.ts`, `same_answer`).
//
// Lane A's live shapes (t174): crossborder asked `find_on_page "Voltbay"` 29
// times on the unchanged home page, each "0 matches", with refused presses
// between that reopened every look; run 41's re-author made 45 finds with
// varied queries on one unchanged page.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tools = [
  { toolId: "find", description: "Search the page for text.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];
type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const stalledError = new Error("stalled");
const find = (index: number, query: string) => ({ kind: "tool_call", callId: `find.${index}`, toolId: "find", input: { query } });
const press = (index: number, target: string) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target } });

/** A home page in state `s<n>`: "Next" moves it on, any other press is refused; a find matches nothing and leaves the page as it was. */
function site() {
  let page = 1;
  const result = (fields: JsonObject, before: number) => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: `s${before}`, after: `s${page}` }, ...fields });
  return vi.fn(async ({ toolId, value }: { callId?: string; toolId: string; value: JsonObject }) => {
    const before = page;
    if (toolId === "find") return result({ evidence: { found: `0 matches for "${String(value.query)}"` }, effectApplied: false, resultCode: "web.inspect.succeeded", draft: { actionId: "web.find", effect: "observe", proposes: false } }, before);
    const click = { draft: { actionId: "web.click", effect: "mutate", proposes: true } };
    if (value.target === "Next") { page += 1; return result({ evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click }, before); }
    return result({ evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", ...click }, before);
  });
}

const loop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof site>) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool, maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: true, unusableDecisions: { maxConsecutive: 8, stalled: () => stalledError }
});

describe("a look that answered the same twice on one page", () => {
  it("crossborder's 'Voltbay': run again after a refused press, then answered from memory with a note to change approach", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(find(1, "Voltbay"))
      .mockResolvedValueOnce(press(2, "Search box"))
      .mockResolvedValueOnce(find(3, "Voltbay"))
      .mockResolvedValueOnce(press(4, "Sale banner"))
      .mockResolvedValueOnce(find(5, "Voltbay"))
      .mockResolvedValueOnce(press(6, "Next"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });

    // The third "Voltbay" is not run: the page is the one the first two answered on, the same way.
    expect(executeTool.mock.calls.map(([call]) => call.callId)).toEqual(["find.1", "press.2", "find.3", "press.4", "press.6"]);
    const note = shownAt(decide, 5).find((entry) => entry.toolId === "core.repeat_check")?.value;
    expect(note).toMatchObject({ code: "llm_evidence_loop.repeat_refused", toolId: "find", sameAsCall: "find.3", then: { outcome: "same_answer" } });
    expect(String(note?.instruction)).toContain("Change your approach");
  });
});

describe("looks in a row with nothing done between them", () => {
  it("run 41's varied finds: told at the fifth that it is searching without acting, and the round stalls at the eighth", async () => {
    const decide = vi.fn().mockImplementation(async () => find(decide.mock.calls.length, `query ${decide.mock.calls.length}`));
    const executeTool = site();

    await expect(loop(decide, executeTool)).rejects.toBe(stalledError);

    expect(executeTool).toHaveBeenCalledTimes(8);
    const note = shownAt(decide, 5).find((entry) => entry.toolId === "core.search_check")?.value;
    expect(note).toMatchObject({ code: "llm_evidence_loop.searching_without_acting", looksInARow: 5, maxLooksInARow: 8 });
    expect((note?.looks as JsonObject[]).map((look) => look.input)).toEqual([1, 2, 3, 4, 5].map((index) => ({ query: `query ${index}` })));
    expect(String(note?.instruction)).toContain("Act on what you found");
    expect(shownAt(decide, 4).some((entry) => entry.toolId === "core.search_check")).toBe(false);
  });

  it("starts counting again after anything that is not a look", async () => {
    const decide = vi.fn();
    for (let index = 0; index < 4; index += 1) decide.mockResolvedValueOnce(find(index, `q${index}`));
    decide.mockResolvedValueOnce(press(4, "Next"));
    for (let index = 5; index < 9; index += 1) decide.mockResolvedValueOnce(find(index, `q${index}`));
    decide.mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(decide.mock.calls.every((_, index) => !shownAt(decide, index).some((entry) => entry.toolId === "core.search_check"))).toBe(true);
  });
});
