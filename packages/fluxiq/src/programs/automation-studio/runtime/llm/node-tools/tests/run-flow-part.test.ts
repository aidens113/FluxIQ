// Running part of the Flow from a chosen step, on the target as it stands
// (`../run-flow-part.ts`, t244).
//
// The user's rule (2026-10-02): the build and repair loops may run the Flow
// from a chosen step to test part of it, and that never replaces the whole-Flow
// test. So the run sends each chosen step through the loop's executor exactly
// as the dry run would, with no reset first, stops at the first step the Flow
// always runs that does not pass, and leaves every step of the draft as it was.
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import { runAutomationStudioFlowDraftPart, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

const REPLAYED = "core.replay.replayed";

const step = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: "web.click",
  toolId: "core.run_node",
  input: { node: "web.click", parameters: {} },
  ranWith: { node: "web.click", parameters: { target: `#s${position}` }, consequences: [] },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: { location: `https://store.test/${position}` } },
  ...over
});

/** An executor whose step at `position` answers `answers[position]` (replayed when absent). */
function host(answers: Record<number, string | "throw"> = {}, options: { abort?: AbortController } = {}) {
  const calls: { callId: string; toolId: string; value: JsonObject }[] = [];
  const executeTool = async (call: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push(call);
    const position = Number(call.callId.split(".").at(-1));
    const code = answers[position] ?? REPLAYED;
    if (code === "throw") {
      options.abort?.abort();
      throw new Error("host went away");
    }
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { at: position, said: code },
      effectApplied: code === REPLAYED,
      resultCode: code,
      stateDigests: { before: `s${position - 1}`, after: `s${position}` }
    };
  };
  return { calls, executeTool };
}

const run = (steps: AutomationStudioFlowDraftStep[], value: JsonObject, executor = host(), signal?: AbortSignal) =>
  runAutomationStudioFlowDraftPart({ steps, value, callId: "part", executeTool: executor.executeTool, ...(signal ? { signal } : {}) });

const four = () => [step(1), step(2), step(3), step(4)];

/** A step carried from an earlier Flow (`../draft-from-flow.ts`): nothing it ran with, nothing to run it again by. */
const carried = (position: number): AutomationStudioFlowDraftStep => {
  const { ranWith: _ranWith, replay: _replay, ...rest } = step(position, { id: `f${position}` });
  return rest;
};

describe("runAutomationStudioFlowDraftPart", () => {
  it("runs only the chosen steps, in order, with the Flow's own arguments and no reset", async () => {
    const executor = host();
    const result = await run(four(), { from: 2, to: 3 }, executor);

    expect(executor.calls.map((call) => [call.callId, call.toolId, call.value.replay])).toEqual([
      ["part.2", "core.run_node", "step"],
      ["part.3", "core.run_node", "step"]
    ]);
    expect(executor.calls[0]!.value).toMatchObject({ node: "web.click", parameters: { target: "#s2" }, from: { location: "https://store.test/2" } });
    expect(executor.calls.some((call) => call.value.replay === "reset")).toBe(false);
    expect(result).toMatchObject({
      kind: "llm_evidence_tool_execution",
      effectApplied: true,
      resultCode: "core.run_flow.ran",
      stateDigests: { before: "s1", after: "s3" },
      evidence: {
        ok: true, passed: true, from: 2, to: 3,
        steps: [{ step: 2, actionId: "web.click", ran: "replayed", resultCode: REPLAYED }, { step: 3, actionId: "web.click", ran: "replayed", resultCode: REPLAYED }],
        last: { step: 3, evidence: { at: 3, said: REPLAYED } }
      }
    });
    expect((result.evidence as JsonObject).stoppedAt).toBeUndefined();
    expect(typeof (result.evidence as JsonObject).instruction).toBe("string");
  });

  it("runs to the Flow's last step when no end is given, skipping steps the draft does not propose", async () => {
    const steps = [step(1), step(2, { disposition: "taken" }), step(3), step(4, { effect: "observe", proposes: false })];
    const executor = host();
    const result = await run(steps, { from: 1 }, executor);
    expect(executor.calls.map((call) => call.callId)).toEqual(["part.1", "part.3"]);
    expect(result.evidence).toMatchObject({ ok: true, passed: true, from: 1, to: 3 });
  });

  it("refuses an argument it cannot read, a draft with nothing in its Flow, and a step that is not one of the Flow's", async () => {
    const executor = host();
    for (const value of [{}, { from: 0 }, { from: 1.5 }, { from: "2" }, { from: 1, to: 0 }, { from: 3, to: 2 }, { from: 1, extra: true }] as JsonObject[]) {
      const refused = await run(four(), value, executor);
      expect(refused).toMatchObject({ effectApplied: false, resultCode: "run_flow.input_invalid", evidence: { ok: false, code: "run_flow.input_invalid" } });
    }
    expect(await run([step(1, { disposition: "taken" })], { from: 1 }, executor)).toMatchObject({ resultCode: "run_flow.nothing_in_flow", evidence: { ok: false } });
    const steps = [step(1), step(2, { disposition: "dropped" }), step(3)];
    expect(await run(steps, { from: 2 }, executor)).toMatchObject({ resultCode: "run_flow.not_a_flow_step", evidence: { ok: false, flowSteps: [1, 3] } });
    expect(await run(steps, { from: 1, to: 9 }, executor)).toMatchObject({ resultCode: "run_flow.not_a_flow_step", evidence: { ok: false, flowSteps: [1, 3] } });
    expect(executor.calls).toEqual([]);
  });

  it("stops at a step the Flow always runs that does not pass, and shows what that step left", async () => {
    const executor = host({ 3: "core.replay.unreproducible" });
    const result = await run(four(), { from: 1 }, executor);
    expect(executor.calls.map((call) => call.callId)).toEqual(["part.1", "part.2", "part.3"]);
    expect(result).toMatchObject({
      resultCode: "core.run_flow.stopped",
      stateDigests: { before: "s0", after: "s3" },
      evidence: { ok: true, passed: false, stoppedAt: 3, last: { step: 3, evidence: { at: 3, said: "core.replay.unreproducible" } } }
    });
    expect((result.evidence as { steps: unknown[] }).steps).toHaveLength(3);
  });

  it("goes on past a step the Flow does not always run that does not pass", async () => {
    const steps = [step(1), step(2, { routing: { kind: "optional" } }), step(3)];
    const executor = host({ 2: "core.replay.failed" });
    const result = await run(steps, { from: 1 }, executor);
    expect(executor.calls.map((call) => call.callId)).toEqual(["part.1", "part.2", "part.3"]);
    expect(result).toMatchObject({ resultCode: "core.run_flow.ran", evidence: { passed: true, steps: [{ ran: "replayed" }, { step: 2, ran: "failed" }, { ran: "replayed" }] } });
  });

  it("checks a step whose effect lasts rather than running it again", async () => {
    const steps = [step(1, { ranWith: { node: "web.click", parameters: {}, consequences: ["create_new"] } })];
    const executor = host({ 1: "core.replay.verified" });
    const result = await run(steps, { from: 1 }, executor);
    expect(executor.calls[0]!.value.replay).toBe("verify");
    expect(executor.calls[0]!.value.produced).toBeUndefined();
    expect(result.evidence).toMatchObject({ passed: true, steps: [{ step: 1, ran: "verified" }] });
  });

  it("stops at a step carried from an earlier Flow that never ran in this build, and sends nothing for it", async () => {
    const steps = [step(1), carried(2), step(3)];
    const executor = host();
    const result = await run(steps, { from: 1 }, executor);
    expect(executor.calls.map((call) => call.callId)).toEqual(["part.1"]);
    expect(result).toMatchObject({
      resultCode: "core.run_flow.stopped",
      evidence: { passed: false, stoppedAt: 2, steps: [{ step: 1, ran: "replayed" }, { step: 2, ran: "not_run_in_this_build" }], last: { step: 1 } }
    });
  });

  it("reads a call that threw as a failed step, and throws only when the run was cancelled", async () => {
    const failed = await run(four(), { from: 1 }, host({ 2: "throw" }));
    expect(failed).toMatchObject({ resultCode: "core.run_flow.stopped", evidence: { stoppedAt: 2, steps: [{ ran: "replayed" }, { step: 2, ran: "failed" }], last: { step: 1 } } });
    const abort = new AbortController();
    await expect(run(four(), { from: 1 }, host({ 2: "throw" }, { abort }), abort.signal)).rejects.toThrow("host went away");
  });

  it("leaves every step of the draft as it was: nothing is marked replayed", async () => {
    const steps = four();
    const before = structuredClone(steps);
    await run(steps, { from: 1 }, host({ 4: "core.replay.changed" }));
    expect(steps).toEqual(before);
    expect(steps.some((each) => each.replayed !== undefined)).toBe(false);
  });
});
