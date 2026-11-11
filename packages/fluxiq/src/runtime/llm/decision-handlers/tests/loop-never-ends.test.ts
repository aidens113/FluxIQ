// A while-loop that could end only by failing is refused when the model writes
// it, through the loop's `draft.loopNeverEnds` (`../amendment.ts`,
// `../../../flow-authoring/draft/amendment/apply.ts`), and the model reads the
// sentence it was refused with in its next decision. Run
// `run-mwblz4aq-0baa810a` wrote a repeat while a press succeeded; it was
// refused only at assembly, after the answer, and the model never saw it.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftLoopNeverEnds } from "../../../flow-authoring/draft/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const go = { toolId: "go", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const stalled = () => new Error("stalled");
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const toldAt = (decide: { mock: { calls: unknown[][] } }, index: number) =>
  ((decide.mock.calls[index]![0] as { evidence: Shown }).evidence).find((entry) => entry.toolId === "core.amendment_check")?.value;
const press = (callId: string, target: string) => ({ kind: "tool_call", callId, toolId: "go", input: { target }, add: true });
const pressed = (control: string, before: string, after: string): JsonValue => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: true, pressed: control }, effectApplied: true, stateDigests: { before, after },
  draft: { actionId: "web.dom.click", proposes: true, effect: "mutate", control, replay: { from: { location: "list" } } }
});

/** Stands in for assembly's sentence (`../../harness-options/draft-acts.ts`): a while-loop on step 2 never ends. */
const SAID = 'Step 1 repeats while step 2 succeeds, and step 2 has no way to say the loop is done. A loop ends when its last step answers ended because there is nothing more: run the step that answers ended (in this library: lib.next, "Next") with add true as the span\'s last step.';
const neverEnds: AutomationStudioFlowDraftLoopNeverEnds = (steps, step) => step.position === 1 && steps.length === 2 ? SAID : undefined;

async function run(draft: { loopNeverEnds?: AutomationStudioFlowDraftLoopNeverEnds }) {
  const decide = vi.fn()
    .mockResolvedValueOnce(press("c1", "t-open"))
    .mockResolvedValueOnce(press("c2", "t-more"))
    .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "repeat", while: 2 }] })
    .mockResolvedValueOnce({ kind: "complete", result: { flow: "ready" } });
  const executeTool = vi.fn()
    .mockResolvedValueOnce(pressed("Open", "s1", "s2"))
    .mockResolvedValueOnce(pressed("More", "s2", "s3"));
  const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled }, draft });
  return { decide, result };
}

describe("a while-loop the loop's caller says never ends", () => {
  it("is refused as it is written, left off the step, and told with the caller's sentence in the next decision", async () => {
    const { decide, result } = await run({ loopNeverEnds: neverEnds });

    const told = toldAt(decide, 3) as { refused: { step: number; reason: string; said?: string; next?: string }[]; applied: number; reasons: JsonObject };
    expect(told.refused).toEqual([expect.objectContaining({ step: 1, reason: "repeat_never_ends", said: SAID })]);
    expect(told.refused[0]!.next).toContain('(in this library: lib.next, "Next")');
    expect(told.applied).toBe(0);
    expect(told.reasons).toHaveProperty("repeat_never_ends");
    expect(result.steps[0]!.routing).toBeUndefined();
  });

  it("is written as before where the caller gives no loop check", async () => {
    const { result } = await run({});
    expect(result.steps[0]!.routing).toEqual({ kind: "repeat", through: result.steps[1]!.id ?? "d2", while: result.steps[1]!.id ?? "d2" });
  });
});
