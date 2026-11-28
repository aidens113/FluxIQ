// A look asked again and answered from memory goes through loop detection (t1096). A manual build asked
// for one whole-page look whose capture had left no page state, and every later identical ask was answered
// from memory; none reached the near-repeat rule, so twelve went by before a window of no progress was
// told. Here the loop steers at the first ask answered from memory, once, and goes on. The site is made up.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput } from "../../../index.ts";
import { automationStudioLlmLoopAttemptRecord } from "../../../repeat-guard/index.ts";

const tools = [
  { toolId: "whole", description: "Show the whole page.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: ReturnType<typeof vi.fn>, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const notesAt = (decide: ReturnType<typeof vi.fn>, index: number, toolId: string): JsonObject[] => shownAt(decide, index).filter((entry) => entry.toolId === toolId).map((entry) => entry.value);
const ask = (index: number) => ({ kind: "tool_call", callId: `whole.${index}`, toolId: "whole", input: {} });
const press = (index: number) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target: `Next ${index}` } });
const done = { kind: "complete", result: { done: true } };

/** Each press lands on a page never seen, but one on a control that is gone; the whole page could not be taken, and leaves no page state, as the recorded capture did. */
function site() {
  let page = 0;
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => {
    if (toolId === "whole") return { kind: "llm_evidence_tool_execution", evidence: { unavailable: "not just now" }, effectApplied: false, resultCode: "whole.unavailable", draft: { actionId: "web.look", effect: "observe", proposes: false } };
    if (value.target === "Gone") return { kind: "llm_evidence_tool_execution", stateDigests: { before: `s${page}`, after: `s${page}` }, evidence: { ok: false, code: "web.action.rejected.target_missing" }, effectApplied: false, resultCode: "web.action.rejected.target_missing", draft: { actionId: "web.click", effect: "mutate", proposes: false } };
    page += 1;
    return { kind: "llm_evidence_tool_execution", stateDigests: { before: `s${page - 1}`, after: `s${page}` }, evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", draft: { actionId: "web.click", effect: "mutate", proposes: true } };
  });
}

function loop(script: readonly unknown[]) {
  const decide = vi.fn();
  decide.mockImplementation(async () => script[decide.mock.calls.length - 1] ?? done);
  const executeTool = site();
  const record = automationStudioLlmLoopAttemptRecord();
  const ran = runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool: executeTool as unknown as AutomationStudioLlmEvidenceLoopInput["executeTool"],
    maxIterations: 12, maxToolCalls: 12, dryRun: false, propagateDecisionErrors: true, attemptRecord: record
  } as AutomationStudioLlmEvidenceLoopInput);
  return { ran, decide, executeTool, record };
}

describe("a look answered from memory, asked again (t1096)", () => {
  it("is steered as a near repeat at its first answer from memory, once, and the loop goes on", async () => {
    const { ran, decide, executeTool, record } = loop([press(0), ask(1), ask(2), done]);

    await expect(ran).resolves.toMatchObject({ ok: true });

    // The look ran once; its second ask was answered from memory, and the next decision was told it is a near repeat.
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(notesAt(decide, 2, "core.loop_check")).toEqual([]);
    expect(notesAt(decide, 3, "core.request_check").at(-1)).toMatchObject({ code: "llm_evidence_loop.already_answered" });
    const steers = notesAt(decide, 3, "core.loop_check");
    expect(steers).toHaveLength(1);
    expect(steers[0]).toMatchObject({ code: "llm_evidence_loop.loop_steered", pattern: "near_repeat", repeats: 2, toolIds: ["whole"] });
    expect(record.lastNoted).toMatchObject({ pattern: "near_repeat", repeats: 2 });
  });

  it("is steered once per ask: the next ask is told on the rung above, and a press that lands ends the incident", async () => {
    const { ran, decide, executeTool } = loop([press(0), ask(1), ask(2), ask(3), press(4), done]);

    await expect(ran).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(notesAt(decide, 3, "core.loop_check")).toEqual([expect.objectContaining({ pattern: "near_repeat", repeats: 2 })]);
    expect(notesAt(decide, 4, "core.loop_check")).toEqual([expect.objectContaining({ pattern: "near_repeat", repeats: 3 })]);
    // The press landed on a page never seen: progress, and the steer no longer stands.
    expect(notesAt(decide, 5, "core.loop_check")).toEqual([]);
  });
});

describe("a failed call sent again and refused by the repeat guard (t1096)", () => {
  it("is refused as it always was, and steered as a near repeat beside the refusal, once", async () => {
    const gone = (index: number) => ({ kind: "tool_call", callId: `gone.${index}`, toolId: "press", input: { target: "Gone" } });
    const { ran, decide, executeTool } = loop([press(0), gone(1), gone(2), done]);

    await expect(ran).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(notesAt(decide, 3, "core.repeat_check").at(-1)).toMatchObject({ code: "llm_evidence_loop.repeat_refused" });
    expect(notesAt(decide, 3, "core.loop_check")).toEqual([expect.objectContaining({ code: "llm_evidence_loop.loop_steered", pattern: "near_repeat", repeats: 2, toolIds: ["press"] })]);
  });
});
