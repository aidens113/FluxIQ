// Three decisions in a row refused for one reason end the round, so the build
// tests what exists instead of spending its purse (week report W2, 2026-10-06;
// `../refusal-run.ts`). The repeat guard stops only identical refusals: lane B
// (`run-muwaq9w3-baaa4e19`, 0027-0036) sent `keep` on a different step each time,
// and `run-murzln6g-11debe1d` spent 14 of 30 decisions on refused amendments.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const press = { toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const stalledError = new Error("stalled");
const complete = { kind: "complete", result: { done: true } };

/** Every press moves the page on and works, except a press on "Gone", which the page refuses. */
function site() {
  let page = 0;
  return vi.fn(async ({ value }: { value: JsonObject }) => {
    const before = `s${page}`;
    if (String(value.target).startsWith("Gone")) {
      return { kind: "llm_evidence_tool_execution", stateDigests: { before, after: before }, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", draft: { actionId: "web.click", effect: "mutate", proposes: true } };
    }
    page += 1;
    return { kind: "llm_evidence_tool_execution", stateDigests: { before, after: `s${page}` }, evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", draft: { actionId: "web.click", effect: "mutate", proposes: true } };
  });
}

const built = ["A", "B", "C"].map((target) => ({ kind: "tool_call", callId: `press.${target}`, toolId: "press", input: { target }, add: true }));
const loop = (decide: ReturnType<typeof vi.fn>, stalled = true) => runAutomationStudioLlmEvidenceLoop({
  tools: [press], decide, executeTool: site(), maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: stalled,
  ...(stalled ? { unusableDecisions: { maxConsecutive: 8, stalled: () => stalledError } } : {})
});

function decisions(...then: JsonObject[]) {
  const decide = vi.fn();
  for (const decision of [...built, ...then]) decide.mockResolvedValueOnce(decision);
  return decide.mockResolvedValue(complete);
}
const keep = (step: number) => ({ kind: "amend_draft", amendments: [{ step, change: "keep" }] });

describe("decisions refused for one reason, three in a row", () => {
  it("keeps of three different steps already in the Flow: warned at the second, the round stalls at the third", async () => {
    const decide = decisions(keep(1), keep(2), keep(3));

    await expect(loop(decide)).rejects.toBe(stalledError);

    expect(decide).toHaveBeenCalledTimes(6);
    const warned = shownAt(decide, 5).find((entry) => entry.toolId === "core.refusal_run")?.value;
    expect(warned).toMatchObject({ ok: false, code: "llm_evidence_loop.refused_in_a_row", inARow: 2, maxInARow: 3 });
    expect(String(warned?.instruction)).toContain("One more decision refused for it ends this exploration");
  });

  it("ends the round where no stall is configured", async () => {
    const result = await loop(decisions(keep(1), keep(2), keep(3)), false);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("repeat_without_progress");
  });

  it("presses the page refused three times in a row for one reason, on three different controls", async () => {
    const gone = (index: number) => ({ kind: "tool_call", callId: `gone.${index}`, toolId: "press", input: { target: `Gone ${index}` } });
    const decide = decisions(gone(1), gone(2), gone(3));

    await expect(loop(decide)).rejects.toBe(stalledError);
    expect(decide).toHaveBeenCalledTimes(6);
  });

  it("does not stop when a decision between them landed, or the reasons differ", async () => {
    const decide = decisions(keep(1), keep(2), { kind: "tool_call", callId: "press.D", toolId: "press", input: { target: "D" }, add: true }, keep(3), { kind: "amend_draft", amendments: [{ step: 9, change: "keep" }] });

    await expect(loop(decide)).resolves.toMatchObject({ ok: true });
  });
});
