// A step the test passes over, said as passed over wherever the test is shown
// (t193 1002-M, live run `run-murzln6g-11debe1d`, C6 and C10).
//
// Draft step 15 pressed the added-to-cart drawer's "×", which the host marked
// an interruption. The test only checked the Add to cart before it, so no
// drawer opened and the "×" failed; the Flow passes over an interruption step,
// so the test passed. Its row still read `failed`, with nothing saying it was
// excused: the judge asked to "fix or remove the failed step 15", and its card
// said "Didn't work". The outcome now says it was excused and why, the call
// tells the activity row before it is sent, and a refusal the model reads
// says the same of such a step beside a step that does block.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowDraftDryRunFeedback, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { replayAutomationStudioFlowDraft } from "../index.ts";

const CART = "https://bigbox.test/p/towels";
const FAILED = "core.replay.failed";

const step = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: "web.click",
  input: { node: "web.click", parameters: {} },
  ranWith: { node: "web.click", parameters: { target: `#s${position}` }, consequences: [] },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: { location: CART } },
  ...over
});

/** A replay of `steps` whose steps answer `answers[position]` (replayed, or verified for a check, when absent), and every call it made. */
async function replay(steps: AutomationStudioFlowDraftStep[], answers: Record<number, string>) {
  const calls: Array<{ callId: string; excusable?: unknown }> = [];
  const executeTool = async (input: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push(input);
    const { callId, value } = input;
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode: "core.replay.replayed" };
    const code = answers[Number(callId.split(".").pop())] ?? (value.replay === "verify" ? "core.replay.verified" : "core.replay.replayed");
    return { kind: "llm_evidence_tool_execution", evidence: { page: callId }, effectApplied: code === "core.replay.replayed", resultCode: code };
  };
  const result = await replayAutomationStudioFlowDraft({ steps, attempt: 1, executeTool });
  return { result, calls, outcome: (position: number) => result.verdict.outcomes.find((each) => each.step === position) };
}

describe("a step the test passes over", () => {
  it("run murzln6g: the drawer's × the host marked an interruption is excused as one, and the call said so before it was sent", async () => {
    const steps = [step(12, { acts: ["a2"] }), step(15, { interruption: true }), step(16, { acts: ["a2.quantity"] })];
    const { result, calls, outcome } = await replay(steps, { 15: FAILED });
    expect(result.verdict.ok).toBe(true);
    expect(outcome(12)).toMatchObject({ mode: "verify", resultCode: "core.replay.verified" });
    expect(outcome(12)).not.toHaveProperty("excused");
    expect(outcome(15)).toMatchObject({ status: "failed", excused: "interruption" });
    expect(outcome(16)).not.toHaveProperty("excused");
    expect(calls.find((call) => call.callId === "dryrun.1.15")?.excusable).toBe("interruption");
    expect(calls.find((call) => call.callId === "dryrun.1.16")).not.toHaveProperty("excusable");
  });

  it("names what the draft says of the step: optional, only if, a fallback, a repeat", async () => {
    const steps = [
      step(1),
      step(2, { routing: { kind: "optional" } }),
      step(3),
      step(4, { routing: { kind: "only_if", check: "d3" } }),
      step(5, { routing: { kind: "on_failed", to: "d6" } }),
      step(6),
      step(7, { routing: { kind: "repeat", through: "d7", over: "d1" } })
    ];
    const { outcome } = await replay(steps, { 2: FAILED, 3: FAILED, 4: FAILED, 6: FAILED, 7: FAILED });
    expect([2, 3, 4, 6, 7].map((position) => outcome(position)?.excused)).toEqual(["optional", "check", "only_if", "fallback", "repeat"]);
  });

  it("excuses a step that needed what a checked step would have done, as withheld", async () => {
    const steps = [step(3, { ranWith: { node: "web.click", parameters: { target: "#s3" }, consequences: ["create"] } }), step(4, { replay: { from: { location: "https://bigbox.test/cart" } } })];
    const { result, outcome } = await replay(steps, { 4: "core.replay.unreproducible" });
    expect(result.verdict.ok).toBe(true);
    expect(outcome(4)).toMatchObject({ withheldBy: 3, excused: "withheld" });
  });

  it("never excuses a step that held, or one the Flow always runs", async () => {
    const steps = [step(2, { interruption: true }), step(3)];
    const { result, outcome } = await replay(steps, { 3: FAILED });
    expect(outcome(2)).not.toHaveProperty("excused");
    expect(outcome(3)).not.toHaveProperty("excused");
    expect(result.verdict.ok).toBe(false);
  });

  it("is said as excused in a refusal the model reads, so it is not asked to fix or drop it", async () => {
    const steps = [step(2), step(15, { interruption: true }), step(19)];
    const { result } = await replay(steps, { 15: FAILED, 19: FAILED });
    expect(result.verdict.ok).toBe(false);
    const feedback = automationStudioFlowDraftDryRunFeedback(result.verdict, new Set(), steps);
    const lines = feedback.steps as JsonObject[];
    expect(lines.find((line) => line.step === 15)).toMatchObject({ replayed: "failed", excused: expect.stringContaining("optional") });
    expect(lines.find((line) => line.step === 19)).not.toHaveProperty("excused");
    expect(String(feedback.instruction)).toMatch(/excused: .*do not (fix|change)/u);
  });
});
