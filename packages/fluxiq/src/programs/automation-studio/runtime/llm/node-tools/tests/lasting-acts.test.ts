// A step that claims an instructed lasting act is checked, not pressed again,
// wherever the build's steps are sent again (t174-w89, D1).
//
// Run `run-murwd8le-79e735a8` Cause 3: Add to cart declared `[]` and claimed
// act `a1`, whose lasting consequence the instruction quotes, and every build
// test pressed it again. The rule (`../../../flow-draft/verify-only.ts`) and the
// one instructed read (`../../../flow-bootstrap/action-permissions.ts`) were
// finished by t174-w83; this is the wiring: the replay, the gate, a rerun's
// put-back and a part run each pass the build's set to the replay mode.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import {
  automationStudioFlowDraftDryRunGate,
  automationStudioNodeRerunFromItsPlace,
  replayAutomationStudioFlowDraft,
  runAutomationStudioFlowDraftPart
} from "../index.ts";

const ITEM = { location: "https://store.test/item/1" };

const step = (position: number, node: string, acts?: string[]): AutomationStudioFlowDraftStep => ({
  position,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters: {}, consequences: [] },
  ranWith: { node, parameters: { selector: `#s${position}` }, consequences: [] },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: ITEM },
  ...(acts ? { acts } : {})
});

/** Choose a colour (a choice of a1), press Add to cart (a1, declared `[]`), open the cart. */
const STEPS = () => [step(1, "node.choose_colour", ["a1.colour"]), step(2, "node.add_to_cart", ["a1"]), step(3, "node.open_cart")];

function host() {
  const executeTool = vi.fn(async ({ value }: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    const code = value.replay === "verify" ? "core.replay.verified" : "core.replay.replayed";
    return { kind: "llm_evidence_tool_execution", evidence: { said: code }, effectApplied: value.replay !== "verify", resultCode: code };
  });
  return executeTool;
}

const sent = (executeTool: ReturnType<typeof host>) => executeTool.mock.calls.map(([call]) => [call.callId, (call.value.node as string | undefined) ?? null, call.value.replay ?? null]);

describe("the build's lasting acts, wherever its steps are sent again", () => {
  it("the replay checks the step that claims one and runs a step that claims only its choice", async () => {
    const executeTool = host();
    const replayed = await replayAutomationStudioFlowDraft({ steps: STEPS(), attempt: 1, executeTool, lastingActs: new Set(["a1"]) });
    expect(sent(executeTool)).toEqual([
      ["dryrun.1.reset", null, "reset"],
      ["dryrun.1.1", "node.choose_colour", "step"],
      ["dryrun.1.2", "node.add_to_cart", "verify"],
      ["dryrun.1.3", "node.open_cart", "step"]
    ]);
    expect(replayed.verdict.ok).toBe(true);
  });

  it("without the set the replay runs the step again, as before", async () => {
    const executeTool = host();
    await replayAutomationStudioFlowDraft({ steps: STEPS(), attempt: 1, executeTool });
    expect(sent(executeTool)[2]).toEqual(["dryrun.1.2", "node.add_to_cart", "step"]);
  });

  it("the gate reads the set once, only when a replay first needs it, before the replay's first call", async () => {
    const executeTool = host();
    const order: string[] = [];
    executeTool.mockImplementation(async ({ value }) => {
      order.push(`call:${String(value.replay)}`);
      const code = value.replay === "verify" ? "core.replay.verified" : "core.replay.replayed";
      return { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: value.replay !== "verify", resultCode: code };
    });
    const lastingActs = vi.fn(async () => { order.push("read"); return new Set(["a1"]) as ReadonlySet<string>; });
    const steps = STEPS();
    const gate = automationStudioFlowDraftDryRunGate({ enabled: true, steps, executeTool, accountEvidence: () => 0, showEvidence: () => undefined, targetMoved: () => undefined, lastingActs });
    expect(lastingActs).not.toHaveBeenCalled();
    expect(await gate()).toBeUndefined();
    // A changed Flow is replayed again, and reads nothing new.
    steps.push(step(4, "node.read_cart"));
    expect(await gate()).toBeUndefined();
    expect(lastingActs).toHaveBeenCalledTimes(1);
    expect(order.slice(0, 2)).toEqual(["read", "call:reset"]);
    expect(steps[1]?.replayed).toMatchObject({ status: "replayed", mode: "verify" });
  });

  it("the gate reads nothing for a Flow it refuses before any replay", async () => {
    const lastingActs = vi.fn(async () => new Set(["a1"]) as ReadonlySet<string>);
    const carried = { ...step(1, "node.add_to_cart", ["a1"]) };
    delete carried.ranWith;
    const gate = automationStudioFlowDraftDryRunGate({ enabled: true, requireRunnable: true, steps: [carried], executeTool: host(), accountEvidence: () => 0, showEvidence: () => undefined, targetMoved: () => undefined, lastingActs });
    expect(await gate()).toMatchObject({ issueCodes: ["llm_evidence_loop.full_run_required"] });
    expect(lastingActs).not.toHaveBeenCalled();
  });

  it("a rerun's put-back checks a step before it that claims one", async () => {
    const executeTool = host();
    const steps = STEPS();
    const place = await automationStudioNodeRerunFromItsPlace({ step: steps[2]!, steps, now: undefined, callId: "rerun.1", executeTool, lastingActs: new Set(["a1"]) });
    expect(place.kind).toBe("put_back");
    expect(sent(executeTool)).toEqual([
      ["rerun.1.place", null, "reset"],
      ["rerun.1.place.1", "node.choose_colour", "step"],
      ["rerun.1.place.2", "node.add_to_cart", "verify"]
    ]);
  });

  it("a part run checks a step that claims one", async () => {
    const executeTool = host();
    const ran = await runAutomationStudioFlowDraftPart({ steps: STEPS(), value: { from: 2, to: 3 }, callId: "part.1", executeTool, lastingActs: new Set(["a1"]) });
    expect(ran.evidence).toMatchObject({ passed: true });
    expect(sent(executeTool)).toEqual([["part.1.2", "node.add_to_cart", "verify"], ["part.1.3", "node.open_cart", "step"]]);
  });

  it("a part run in a loop gets the set through the loop's own input", async () => {
    const tools = [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
    const executeTool = vi.fn(async ({ value }: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }) => {
      if (value.replay !== undefined) {
        const code = value.replay === "verify" ? "core.replay.verified" : "core.replay.replayed";
        return { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: value.replay !== "verify", resultCode: code };
      }
      return {
        kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded",
        draft: { actionId: "web.click", effect: "mutate", proposes: true, ranWith: { target: "Add", consequences: [] }, replay: { from: ITEM } }
      };
    });
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "add.1", toolId: "press", input: { target: "Add", consequences: [] }, add: true, act: "a1" })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "part.1", toolId: "core.run_flow", input: { from: 1 } })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const lastingActs = vi.fn(async () => new Set(["a1"]) as ReadonlySet<string>);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxIterations: 6, maxToolCalls: 6, propagateDecisionErrors: true, lastingActs });
    expect(result).toMatchObject({ ok: true });
    expect(executeTool.mock.calls.map(([call]) => [call.callId, call.value.replay ?? null])).toEqual([
      ["add.1", null],
      ["part.1.1", "verify"],
      ["dryrun.1.reset", "reset"],
      ["dryrun.1.1", "verify"]
    ]);
    // One read for the part run and the dry run together.
    expect(lastingActs).toHaveBeenCalledTimes(1);
  });
});
