// Each pattern and each step of the ladder, through the real evidence loop with
// a scripted model: what repeats, how it is told, what is refused before it runs
// and how the round stops. The sites here are made up and share nothing with a
// realistic scenario.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../../activity/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput } from "../../../index.ts";
import { automationStudioLlmLoopAttemptRecord, automationStudioLlmLoopsCaught, type AutomationStudioLlmLoopSignal } from "../index.ts";

const tools = [
  { toolId: "read", description: "Read the list in view.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "look", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const stalledError = new Error("stalled");
const shownAt = (decide: ReturnType<typeof vi.fn>, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const noteAt = (decide: ReturnType<typeof vi.fn>, index: number, toolId: string): JsonObject | undefined => shownAt(decide, index).find((entry) => entry.toolId === toolId)?.value;
const call = (index: number, toolId: string, input: JsonObject) => ({ kind: "tool_call", callId: `${toolId}.${index}`, toolId, input });
const scripted = (next: (index: number) => unknown) => {
  const decide = vi.fn();
  decide.mockImplementation(async () => next(decide.mock.calls.length));
  return decide;
};
const click = { draft: { actionId: "web.click", effect: "mutate", proposes: true } };
const read = { draft: { actionId: "web.read", effect: "observe", proposes: true } };

/** Answers a call with the page it found and left. */
const answer = (before: string, after: string, fields: JsonObject) => ({ kind: "llm_evidence_tool_execution", stateDigests: { before, after }, ...fields });

/** A close button something covers: refused every time, on a page that never moves. */
const coveredButton = () => vi.fn(async () => answer("s1", "s1", { evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_covered", resultReason: "target_covered", ...click }));

const loop = (decide: ReturnType<typeof vi.fn>, executeTool: unknown, extra: Record<string, unknown> = {}) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool: executeTool as AutomationStudioLlmEvidenceLoopInput["executeTool"], maxIterations: 60, maxToolCalls: 60, dryRun: false, propagateDecisionErrors: true,
  unusableDecisions: { maxConsecutive: 40, stalled: () => stalledError }, ...extra
});

describe("a near repeat: the same call with only its words changed", () => {
  it("gets past the exact guard once, is steered, and is then refused before it runs", async () => {
    const decide = scripted((index) => call(index, "press", { target: "Close", reason: `attempt number ${index}` }));
    const executeTool = coveredButton();

    await expect(loop(decide, executeTool)).rejects.toBe(stalledError);

    // Two ran: the first, and the first rewording. Everything after was refused unrun, and three in a row stalled the round.
    expect(executeTool).toHaveBeenCalledTimes(2);
    const steer = noteAt(decide, 2, "core.loop_check");
    expect(steer).toMatchObject({ code: "llm_evidence_loop.loop_steered", pattern: "near_repeat", repeats: 2, toolIds: ["press"], unchanged: ["page", "rows", "acts", "draft"] });
    expect(String(steer?.instruction)).toContain("2 times");
    expect(String(steer?.instruction)).toContain("no new page");
    const refused = noteAt(decide, 3, "core.repeat_check");
    expect(refused).toMatchObject({ code: "llm_evidence_loop.repeat_refused", toolId: "press", sameAsCall: "press.2", then: { outcome: "near_repeat" }, refusedInARow: 1 });
    expect(String(refused?.instruction)).toContain("was not run");
    expect(String(refused?.instruction)).not.toContain("exact call");
  });

  it("does not take text a node types for free text: another note typed into the page is another call", async () => {
    const decide = scripted((index) => index <= 4 ? call(index, "press", { node: "type", parameters: { note: `entry ${index}` } }) : { kind: "complete", result: { done: true } });
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => answer("s1", "s1", { evidence: { ok: true, typed: value.parameters as JsonValue }, effectApplied: true, resultCode: "web.action.succeeded", ...click }));

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });

    expect(executeTool).toHaveBeenCalledTimes(4);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });
});

describe("a cycle: the same calls in the same order, across pages", () => {
  /** A menu opens one page and closes back to another; each press moves the page, so neither is a call that changed nothing. */
  const menu = () => {
    let open = false;
    return vi.fn(async ({ value }: { value: JsonObject }) => {
      const before = open ? "opened" : "closed";
      open = value.target === "Open";
      return answer(before, open ? "opened" : "closed", { evidence: { ok: true, at: open ? "opened" : "closed" }, effectApplied: true, resultCode: "web.action.succeeded", ...click });
    });
  };

  it("A B A B with nothing new is steered, and the next call round it is refused before it runs", async () => {
    // Reworded each time, so the exact guard's memory of where a press ends never answers.
    const decide = scripted((index) => call(index, "press", { target: index % 2 === 1 ? "Open" : "Close", reason: `because ${index}` }));
    const executeTool = menu();

    await expect(loop(decide, executeTool)).rejects.toBe(stalledError);

    expect(noteAt(decide, 4, "core.loop_check")).toMatchObject({ pattern: "cycle", repeats: 2, toolIds: ["press"] });
    expect(executeTool).toHaveBeenCalledTimes(4);
    expect(noteAt(decide, 5, "core.repeat_check")).toMatchObject({ then: { outcome: "cycle" } });
  });
});

describe("no progress: a window of calls that each ran and brought nothing new", () => {
  // Each press is another control, each answers differently, and the page never moves.
  const newControls = () => ({
    decide: scripted((index) => call(index, "press", { target: `control ${index}` })),
    executeTool: vi.fn(async ({ value }: { value: JsonObject }) => answer("s1", "s1", { evidence: { ok: true, target: value.target as JsonValue }, effectApplied: true, resultCode: "web.action.succeeded", ...click }))
  });

  it("is steered at the window, and a caller on the single-loop path hears when new ways round bring nothing either", async () => {
    const { decide, executeTool } = newControls();
    const signals: AutomationStudioLlmLoopSignal[] = [];
    const loopSignal = (signal: AutomationStudioLlmLoopSignal): "end" => {
      signals.push(signal);
      return "end";
    };

    await expect(loop(decide, executeTool, { maxStepsWithoutProgress: 40, loopSignal })).rejects.toBe(stalledError);

    expect(noteAt(decide, 12, "core.loop_check")).toMatchObject({ pattern: "no_progress", repeats: 12 });
    expect(noteAt(decide, 11, "core.loop_check")).toBeUndefined();
    // Told again once, then three more that brought nothing: the ladder's last step.
    expect(executeTool).toHaveBeenCalledTimes(16);
    expect(signals.map((signal) => signal.kind)).toEqual(["change_approach"]);
  });

  it("with no caller to hear it, no new way to end exists: the loop is steered and goes on to the ending it always had", async () => {
    const { decide, executeTool } = newControls();

    const result = await loop(decide, executeTool, { maxStepsWithoutProgress: 40 });

    // The existing no-progress guard's own bound, reached with no help: forty steps, as it was given.
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(executeTool.mock.calls.length).toBeGreaterThan(16);
    expect(noteAt(decide, 12, "core.loop_check")).toMatchObject({ pattern: "no_progress" });
    expect(result.trace.some((row) => row.resultCode === "llm_evidence_loop.loop_change_approach")).toBe(false);
  });

  it("refuses a call already made in the window, not one that is new", async () => {
    const decide = scripted((index) => call(index, "press", { target: `control ${index <= 12 ? index : 3}`, reason: `because ${index}` }));
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => answer("s1", "s1", { evidence: { ok: true, target: value.target as JsonValue }, effectApplied: true, resultCode: "web.action.succeeded", ...click }));

    await expect(loop(decide, executeTool, { maxStepsWithoutProgress: 40 })).rejects.toBe(stalledError);

    expect(executeTool).toHaveBeenCalledTimes(12);
  });
});

describe("working through rows or pages is never a loop", () => {
  it("the same next-page call again and again, each on a new page with new rows, is never steered", async () => {
    let page = 1;
    const decide = scripted((index) => index > 40 ? { kind: "complete", result: { done: true } } : index % 2 === 1 ? call(index, "read", { list: "results" }) : call(index, "press", { target: "Next" }));
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
      if (toolId === "read") return answer(`p${page}`, `p${page}`, { evidence: { ok: true, readRows: { rows: [{ name: `row ${page}a` }, { name: `row ${page}b` }] } }, effectApplied: true, resultCode: "web.inspect.succeeded", ...read });
      page += 1;
      return answer(`p${page - 1}`, `p${page}`, { evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click });
    });

    await expect(loop(decide, executeTool).then((result) => result.ok ? "finished" : result.code)).resolves.toBe("finished");

    expect(executeTool).toHaveBeenCalledTimes(40);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });

  it("the same act on each row in turn, each landing on a new state, is never steered", async () => {
    const decide = scripted((index) => index > 25 ? { kind: "complete", result: { done: true } } : call(index, "press", { target: "Confirm", row: index }));
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => answer(`done-${Number(value.row) - 1}`, `done-${String(value.row)}`, { evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click }));

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(25);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });

  it("a node's validated temporary failures are no model loop: the same call runs until it lands, and nothing is said", async () => {
    let left = 4;
    const decide = scripted((index) => index > 5 ? { kind: "complete", result: { done: true } } : call(index, "press", { target: "Busy", reason: `again ${index}` }));
    const executeTool = vi.fn(async () => {
      if (left-- > 0) return answer("s1", "s1", { evidence: { ok: false, code: "rate_limited" }, effectApplied: false, resultCode: "web.action.rejected.rate_limited", failure: { category: "action_failed", code: "client.capacity", retryable: true, effect: "unacted", transient: true }, ...click });
      return answer("s1", "s2", { evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click });
    });

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(5);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });
});

describe("the same lasting act again: the page changes each time, and that is no progress", () => {
  /** A cart whose count goes up with each press, so every press lands on a page never seen. */
  const cart = () => {
    let count = 0;
    return vi.fn(async () => {
      count += 1;
      return answer(`cart-${count - 1}`, `cart-${count}`, { evidence: { ok: true, inCart: count }, effectApplied: true, resultCode: "web.action.succeeded", ...click });
    });
  };
  const addOne = (index: number, fields: JsonObject = {}) => call(index, "press", { target: "Add", consequences: ["modify_existing"], ...fields });

  /** The new path's caller: it hears a signal and ends the round. */
  const newPath = { loopSignal: (): "end" => "end" };

  it("on the new path, is told on the first repeat and refused from then on, though every press moved the page", async () => {
    const decide = scripted((index) => addOne(index, { reason: `one more ${index}` }));
    const executeTool = cart();

    await expect(loop(decide, executeTool, newPath)).rejects.toBe(stalledError);

    // One landed, one repeat landed and was told, and nothing else ran.
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(noteAt(decide, 2, "core.loop_check")).toMatchObject({ pattern: "same_act", repeats: 2, toolIds: ["press"], unchanged: ["rows"] });
    expect(noteAt(decide, 3, "core.repeat_check")).toMatchObject({ then: { outcome: "same_act" } });
  });

  it("in the old modes, with no loopSignal, is told every time and never refused: the act's repeats all run", async () => {
    const decide = scripted((index) => index > 5 ? { kind: "complete", result: { done: true } } : addOne(index, { reason: `one more ${index}` }));
    const executeTool = cart();

    const result = await loop(decide, executeTool);

    expect(result.ok).toBe(true);
    expect(executeTool).toHaveBeenCalledTimes(5);
    const told = decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).filter((entry) => entry.toolId === "core.loop_check");
    expect(told.at(-1)?.value).toMatchObject({ pattern: "same_act", repeats: 5 });
    expect(String(told.at(-1)?.value.instruction)).not.toContain("refused");
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.repeat_check")).toBe(false);
    expect(automationStudioLlmLoopsCaught(result.trace).same_act).toMatchObject({ steered: 4, refused: 0 });
  });

  it("in the old modes, an act that returns to the page it left is still never refused", async () => {
    let inCart = false;
    const decide = scripted((index) => index > 8 ? { kind: "complete", result: { done: true } } : index % 2 === 1 ? addOne(index, { reason: `again ${index}` }) : call(index, "press", { target: "Back", reason: `back ${index}` }));
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => {
      const before = inCart ? "added" : "shop";
      inCart = value.target === "Add";
      return answer(before, inCart ? "added" : "shop", { evidence: { ok: true, at: before }, effectApplied: true, resultCode: "web.action.succeeded", ...click });
    });

    await loop(decide, executeTool);

    const refused = decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).filter((entry) => entry.toolId === "core.repeat_check").map((entry) => (entry.value.then as JsonObject).outcome);
    expect(refused).not.toContain("same_act");
    expect(executeTool.mock.calls.filter(([sent]) => sent.value.target === "Add").length).toBeGreaterThanOrEqual(2);
  });

  describe("a repeat the task asks for (askedRepeats, from the act record)", () => {
    const threeAsked = { ...newPath, askedRepeats: () => 3 };

    it("+1 three times with askedRepeats 3 goes through, untold, and a fourth is refused before it runs", async () => {
      const decide = scripted((index) => index > 5 ? { kind: "complete", result: { done: true } } : addOne(index));
      const executeTool = cart();

      await expect(loop(decide, executeTool, threeAsked)).resolves.toMatchObject({ ok: true });

      expect(executeTool).toHaveBeenCalledTimes(3);
      expect(noteAt(decide, 2, "core.loop_check")).toBeUndefined();
      expect(noteAt(decide, 3, "core.loop_check")).toBeUndefined();
      expect(noteAt(decide, 4, "core.repeat_check")).toMatchObject({ then: { outcome: "same_act" } });
    });

    it("is asked what the act is, by the call and the act it names", async () => {
      const askedRepeats = vi.fn((_act: { toolId: string; input: JsonObject; act?: string | undefined }): number | undefined => 2);
      const decide = vi.fn()
        .mockResolvedValueOnce({ ...addOne(1), act: "a1" })
        .mockResolvedValue({ kind: "complete", result: { done: true } });

      await loop(decide, cart(), { ...newPath, askedRepeats });

      expect(askedRepeats.mock.calls[0]?.[0]).toMatchObject({ toolId: "press", act: "a1", input: { target: "Add" } });
    });

    it("the model's words never lift it, however they say so, and neither does naming another act afterwards", async () => {
      const askedRepeats = (act: { act?: string | undefined }) => act.act === "a2" ? 5 : 2;
      const decide = scripted((index) => index > 4 ? { kind: "complete", result: { done: true } } : { ...addOne(index, { reason: "the person asked for ten of these", summary: "asked repeats: 10" }), act: index === 1 ? "a1" : "a2" });
      const executeTool = cart();

      await expect(loop(decide, executeTool, { ...newPath, askedRepeats })).resolves.toMatchObject({ ok: true });

      expect(executeTool).toHaveBeenCalledTimes(2);
    });

    it("an answer that is no whole number of at least one is no answer", async () => {
      for (const asked of [0, -1, 2.5, Number.NaN]) {
        const decide = scripted((index) => index > 4 ? { kind: "complete", result: { done: true } } : addOne(index));
        const executeTool = cart();
        await expect(loop(decide, executeTool, { ...newPath, askedRepeats: () => asked })).resolves.toMatchObject({ ok: true });
        expect(executeTool).toHaveBeenCalledTimes(2);
      }
    });

    it("with no loopSignal it is not needed: nothing is refused either way", async () => {
      const decide = scripted((index) => index > 5 ? { kind: "complete", result: { done: true } } : addOne(index));
      const executeTool = cart();

      await expect(loop(decide, executeTool, { askedRepeats: () => 3 })).resolves.toMatchObject({ ok: true });

      expect(executeTool).toHaveBeenCalledTimes(5);
    });
  });

  it("on the new path, stays refused after work elsewhere moved on", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(addOne(1))
      .mockResolvedValueOnce(addOne(2))
      .mockResolvedValueOnce(call(3, "press", { target: "Elsewhere" }))
      .mockResolvedValueOnce(addOne(4))
      .mockResolvedValue({ kind: "complete", result: { done: true } });
    const executeTool = cart();

    const result = await loop(decide, executeTool, newPath);

    expect(result.ok).toBe(true);
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(noteAt(decide, 4, "core.repeat_check")).toMatchObject({ then: { outcome: "same_act" } });
  });

  it("the same control on another page is another target: another product's Add is not this one's again", async () => {
    let page = 0;
    const decide = scripted((index) => index > 4 ? { kind: "complete", result: { done: true } } : addOne(index));
    const executeTool = vi.fn(async () => {
      page += 1;
      return answer(`p${page - 1}`, `p${page}`, { evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", routeState: { page: { location: `/product/${page}` } }, ...click });
    });

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(4);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });

  it("is not told of a press that states nothing lasting, such as a next-page button", async () => {
    const decide = scripted((index) => index > 5 ? { kind: "complete", result: { done: true } } : call(index, "press", { target: "Next", consequences: [] }));
    const executeTool = cart();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(5);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });

  it("a new row identity read between them makes the next one another row's", async () => {
    let page = 0;
    const decide = vi.fn()
      .mockResolvedValueOnce(call(1, "read", { list: "items" }))
      .mockResolvedValueOnce(addOne(2))
      .mockResolvedValueOnce(call(3, "read", { list: "items", more: true }))
      .mockResolvedValueOnce(addOne(4))
      .mockResolvedValueOnce(call(5, "read", { list: "items", evenMore: true }))
      .mockResolvedValueOnce(addOne(6))
      .mockResolvedValue({ kind: "complete", result: { done: true } });
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
      page += 1;
      return toolId === "read"
        ? answer(`s${page - 1}`, `s${page}`, { evidence: { ok: true, readRows: { rows: [{ name: `row ${page}` }] } }, effectApplied: true, resultCode: "web.inspect.succeeded", ...read })
        : answer(`s${page - 1}`, `s${page}`, { evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click });
    });

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(6);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });

  it("the task's own row binding says each is a different row", async () => {
    const decide = scripted((index) => index > 4 ? { kind: "complete", result: { done: true } } : addOne(index, { item: { fields: ["name"] } }));
    const executeTool = cart();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(4);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });

  it("an act undone may be done again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(addOne(1))
      .mockResolvedValueOnce(call(2, "press", { target: "Remove", consequences: ["delete"], undoes: "step 1" }))
      .mockResolvedValueOnce(addOne(3))
      .mockResolvedValue({ kind: "complete", result: { done: true } });
    const executeTool = cart();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });
});

describe("the same control under a renumbered handle", () => {
  /** A control the host reports by what it really ran with, whichever handle named it. */
  const resolved = (element: string) => vi.fn(async ({ value }: { value: JsonObject }) => answer("s1", "s1", {
    evidence: { ok: false, code: "target_covered" }, effectApplied: false, resultCode: "web.action.rejected.target_covered",
    draft: { actionId: "web.click", effect: "mutate", proposes: true, input: value, ranWith: { node: "click", parameters: { target: { handle: value.handle as JsonValue }, element: { selector: element } }, consequences: [] } }
  }));

  it("is the same call: the fingerprint says so, where the handle cannot", async () => {
    const decide = scripted((index) => call(index, "press", { handle: `t${index}` }));
    const executeTool = resolved("button.close");

    await expect(loop(decide, executeTool, { maxStepsWithoutProgress: 40 })).rejects.toBe(stalledError);

    expect(noteAt(decide, 2, "core.loop_check")).toMatchObject({ pattern: "near_repeat", repeats: 2 });
  });

  it("two controls that really are different stay different, though their handles look alike", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(call(1, "press", { handle: "t1" }))
      .mockResolvedValueOnce(call(2, "press", { handle: "t2" }))
      .mockResolvedValue({ kind: "complete", result: { done: true } });
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => answer("s1", "s1", {
      evidence: { ok: false, code: "target_covered", handle: value.handle as JsonValue }, effectApplied: false, resultCode: "web.action.rejected.target_covered",
      draft: { actionId: "web.click", effect: "mutate", proposes: true, input: value, ranWith: { node: "click", parameters: { element: { selector: `button.${String(value.handle)}` } }, consequences: [] } }
    }));

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(noteAt(decide, 2, "core.loop_check")).toBeUndefined();
  });
});

describe("the same fix again", () => {
  const stepRead = { kind: "tool_call", callId: "read.1", toolId: "read", input: { list: "results" }, add: true };
  const twoSteps = { kind: "tool_call", callId: "press.2", toolId: "press", input: { target: "Next" }, add: true };

  it("an edit undone and redone is steered, and then refused before any of it runs", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(stepRead)
      .mockResolvedValueOnce(twoSteps)
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "drop" }] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "keep" }] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "drop" }] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "keep" }] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "drop" }] })
      .mockResolvedValue({ kind: "complete", result: { done: true } });
    let page = 1;
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
      if (toolId === "read") return answer("s1", "s1", { evidence: { ok: true, readRows: { rows: [{ name: "one" }] } }, effectApplied: true, resultCode: "web.inspect.succeeded", ...read });
      page += 1;
      return answer(`s${page - 1}`, `s${page}`, { evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click });
    });

    const result = await loop(decide, executeTool);

    const steered = decide.mock.calls.flatMap((_, index) => shownAt(decide, index)).filter((entry) => entry.toolId === "core.loop_check");
    expect(steered[0]?.value).toMatchObject({ pattern: "same_fix", toolIds: ["amend_draft"] });
    expect(automationStudioLlmLoopsCaught(result.trace).same_fix.steered).toBeGreaterThanOrEqual(1);
  });

  it("a submission a trial refused, sent again in a fresh loop with the same record, is known; one never judged is not", async () => {
    const finishing = { submit: "submit", test: "test" };
    const submitTools = [
      { toolId: "submit", description: "Submit a Flow.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true },
      { toolId: "test", description: "Test a Flow.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
    ];
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => toolId === "submit"
      ? answer("s1", "s1", { evidence: { ok: true, digest: "d1" }, effectApplied: false, resultCode: "candidate.accepted" })
      : answer("s1", "s1", { evidence: { ok: false, code: "candidate.trial_no" }, effectApplied: true, resultCode: "candidate.trial_no" }));
    const record = automationStudioLlmLoopAttemptRecord();
    const run = (decide: ReturnType<typeof vi.fn>) => runAutomationStudioLlmEvidenceLoop({ tools: submitTools, decide, executeTool: executeTool as unknown as AutomationStudioLlmEvidenceLoopInput["executeTool"], maxIterations: 20, maxToolCalls: 20, dryRun: false, draft: false, discoveryOnly: true, finishingTools: finishing, attemptRecord: record });
    const script = (flow: string) => vi.fn().mockResolvedValueOnce(call(1, "submit", { flow, summary: "first words" })).mockResolvedValueOnce(call(2, "test", { revision: 1 })).mockResolvedValue({ kind: "complete", result: { done: true } });

    await run(script("step one"));
    // What was tried survives as data: digests and closed words, nothing the model wrote.
    const carried = automationStudioLlmLoopAttemptRecord(JSON.parse(JSON.stringify(record.data())));
    expect(JSON.stringify(record.data())).not.toContain("step one");
    expect(JSON.stringify(record.data())).not.toContain("first words");
    expect(carried.data().tried.some((entry) => entry.kind === "fix" && entry.outcome === "failed")).toBe(true);

    const fresh = vi.fn().mockResolvedValueOnce(call(1, "submit", { flow: "step one", summary: "other words" })).mockResolvedValue({ kind: "complete", result: { done: true } });
    await run(fresh);
    expect(noteAt(fresh, 1, "core.loop_check")).toMatchObject({ pattern: "same_fix", repeats: 2, toolIds: ["submit"] });

    const another = vi.fn().mockResolvedValueOnce(call(1, "submit", { flow: "step two" })).mockResolvedValue({ kind: "complete", result: { done: true } });
    await run(another);
    expect(noteAt(another, 1, "core.loop_check")).toBeUndefined();
  });
});

describe("the ladder's last steps: a signal the caller answers", () => {
  /** Reworded presses of a covered control, every one. */
  const rewording = () => scripted((index) => index > 16 ? { kind: "complete", result: { done: true } } : call(index, "press", { target: "Close", reason: `attempt ${index}` }));

  it("a caller that answers continue goes on, is told change_approach, and past two fresh approaches ask_person", async () => {
    const signals: AutomationStudioLlmLoopSignal[] = [];
    const decide = rewording();
    const executeTool = coveredButton();

    const loopSignal = (signal: AutomationStudioLlmLoopSignal): "continue" => {
      signals.push(signal);
      return "continue";
    };
    await expect(loop(decide, executeTool, { loopSignal })).resolves.toMatchObject({ ok: true });

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(signals.map((signal) => signal.kind).slice(0, 3)).toEqual(["change_approach", "change_approach", "ask_person"]);
    expect(signals[0]).toMatchObject({ pattern: "near_repeat", toolIds: ["press"], approaches: 1 });
    expect(signals[1]).toMatchObject({ approaches: 2 });
  });

  it("a caller that answers end stops the round where it stands, as a stall does", async () => {
    const signals: AutomationStudioLlmLoopSignal[] = [];
    const decide = rewording();

    const loopSignal = (signal: AutomationStudioLlmLoopSignal): "end" => {
      signals.push(signal);
      return "end";
    };
    await expect(loop(decide, coveredButton(), { loopSignal })).rejects.toBe(stalledError);
    expect(signals.map((signal) => signal.kind)).toEqual(["change_approach"]);
  });

  it("a loop with no caller to ask ends with the very ending today's callers already handle", async () => {
    const decide = rewording();
    const issueCodes: string[][] = [];
    const stalled = (stall: { issueCodes: string[] }): Error => {
      issueCodes.push(stall.issueCodes);
      return stalledError;
    };
    await expect(loop(decide, coveredButton(), { unusableDecisions: { maxConsecutive: 40, stalled } })).rejects.toBe(stalledError);
    expect(issueCodes[0]?.[0]).toBe("llm_evidence_loop.repeat_refused");
  });

  it("a fresh loop on the same record goes on counting fresh approaches", async () => {
    const record = automationStudioLlmLoopAttemptRecord();
    const kinds: string[] = [];
    const loopSignal = (signal: AutomationStudioLlmLoopSignal): "end" => {
      kinds.push(signal.kind);
      return "end";
    };
    const run = () => loop(rewording(), coveredButton(), { attemptRecord: record, loopSignal }).catch((error: unknown) => error);

    await run();
    await run();
    await run();

    expect(kinds).toEqual(["change_approach", "change_approach", "ask_person"]);
  });
});

describe("what the ladder never touches", () => {
  it("a call the permission gate refused stays refused however it is worded, and goes through the gate each time it runs", async () => {
    const gate = vi.fn(async () => answer("s1", "s1", { evidence: { ok: false, code: "permission_required" }, effectApplied: false, resultCode: "web.action.rejected.permission_required", resultReason: "permission_required", ...click }));
    const decide = scripted((index) => call(index, "press", { target: "Delete", reason: `I am sure ${index}`, granted: index > 99 }));

    await expect(loop(decide, gate)).rejects.toBe(stalledError);

    // Twice to the gate, both refused; nothing the ladder did let a third through or marked anything as granted.
    expect(gate).toHaveBeenCalledTimes(2);
    expect(noteAt(decide, 3, "core.repeat_check")).toMatchObject({ then: { outcome: "near_repeat" } });
  });

  it("a lasting act that landed and moved the page is not run again from where it was by being reworded", async () => {
    let page = "cart-empty";
    const decide = scripted((index) => call(index, "press", { target: "Add", reason: `one more ${index}` }));
    const executeTool = vi.fn(async () => {
      const before = page;
      page = "cart-holds-one";
      return before === page
        ? answer(before, page, { evidence: { ok: false, code: "already_done" }, effectApplied: false, resultCode: "web.action.rejected.already_done", ...click })
        : answer(before, page, { evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click });
    });

    await expect(loop(decide, executeTool)).rejects.toBe(stalledError);
    // The act landed once; what followed were refusals by the site's own answer, and then by the ladder before anything ran.
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(noteAt(decide, 4, "core.repeat_check")).toMatchObject({ then: { outcome: "near_repeat" } });
  });
});

describe("what the person and the Lab see", () => {
  let seen: ClientGatewayActivity[] = [];
  let unsubscribe: () => void = () => undefined;
  const directory = { path: "" };
  beforeEach(() => {
    seen = [];
    unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    directory.path = mkdtempSync(join(tmpdir(), "loop-steps-"));
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory.path;
  });
  afterEach(() => {
    unsubscribe();
    delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    rmSync(directory.path, { recursive: true, force: true });
  });

  it("a steer is one chat step in a person's words, a row on the record and a step folder, and names no value", async () => {
    const secretWords = "zebra-control-words";
    const decide = scripted((index) => call(index, "press", { target: secretWords, reason: `attempt ${index}` }));

    const stalled = await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () => loop(decide, coveredButton()).catch((error: unknown) => error));
    expect(stalled).toBe(stalledError);

    const steps = seen.filter((event) => event.detail?.kind === "thought");
    expect(steps).toHaveLength(1);
    expect(steps[0]?.detail).toMatchObject({ title: "Noticed it was repeating itself", status: "succeeded" });
    expect(steps[0]?.detail?.text).toBe("FluxIQ tried the same thing 2 times and nothing changed, so it is trying something else.");

    const folders = readdirSync(directory.path).filter((name) => /^\d{4,}-loop$/u.test(name));
    expect(folders).toHaveLength(1);
    const meta = JSON.parse(readFileSync(join(directory.path, folders[0]!, "meta.json"), "utf8")) as JsonObject;
    expect(meta).toMatchObject({ kind: "loop", rung: "steer", pattern: "near_repeat", repeats: 2, toolIds: ["press"] });
    expect(JSON.stringify(meta)).not.toContain(secretWords);

    const note = noteAt(decide, 2, "core.loop_check");
    expect(JSON.stringify(note)).not.toContain(secretWords);
  });

  it("loops caught are counted by pattern from what the run reports", async () => {
    const script = vi.fn().mockResolvedValueOnce(call(1, "press", { target: "Close", reason: "one" })).mockResolvedValueOnce(call(2, "press", { target: "Close", reason: "two" })).mockResolvedValueOnce(call(3, "press", { target: "Close", reason: "three" })).mockResolvedValue({ kind: "complete", result: { done: true } });
    const ran = await loop(script, coveredButton());
    expect(automationStudioLlmLoopsCaught(ran.trace).near_repeat).toEqual({ steered: 1, refused: 1, changeApproach: 0, askPerson: 0 });

    const counted = automationStudioLlmLoopsCaught([
      { resultCode: "llm_evidence_loop.loop_steered", resultReason: "near_repeat" },
      { resultCode: "llm_evidence_loop.repeat_refused", resultReason: "near_repeat" },
      { resultCode: "llm_evidence_loop.repeat_refused", resultReason: "failed" },
      { resultCode: "llm_evidence_loop.loop_change_approach", resultReason: "cycle" },
      { resultCode: "llm_evidence_loop.loop_ask_person", resultReason: "no_progress" },
      { resultCode: "web.action.succeeded" }
    ]);
    expect(counted.near_repeat).toEqual({ steered: 1, refused: 1, changeApproach: 0, askPerson: 0 });
    expect(counted.exact_repeat.refused).toBe(1);
    expect(counted.cycle.changeApproach).toBe(1);
    expect(counted.no_progress.askPerson).toBe(1);
  });
});
