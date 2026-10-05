// A build's test checks the step that does an instructed lasting act, and the
// instruction is read for it once (t174-w89, D1; run `run-murwd8le-79e735a8`
// Cause 3).
//
// Wired as the service wires it (`../../../service.ts`): the build's gate
// (`automationStudioFlowBootstrapActionPermissions`) answers which of the
// instruction's acts last, from the one instruction read the gate holds, and
// the loop hands that answer to its dry run. Add to cart declared `[]` and
// claimed `a1`, the act the instruction's lasting consequence quotes, and both
// of the run's tests pressed it again (0045, 0068). Here it is checked, and the
// cross-check after the build reuses the read rather than paying for another.
//
// Here rather than in `../../../tests/`, which is past its file limit: the loop
// is the stage, and what is under test is this directory's dry run.
import { describe, expect, it, vi } from "vitest";
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionDeclaration, AutomationStudioInstructedConsequence } from "../../../action-permissions/index.ts";
import { automationStudioFlowBootstrapActionPermissions, automationStudioInstructedActs } from "../../../flow-bootstrap/index.ts";
import { automationStudioFlowDraftDryRunGate } from "../index.ts";

const INSTRUCTION = "On Farbazaar, put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain. Do not buy anything.";
const DIGEST = `sha256:${"0".repeat(64)}`;
const READ: AutomationStudioInstructedConsequence[] = [
  { consequence: "create_new", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart" }
];
const ITEM = { location: "https://farbazaar.test/item/1005008123450" };
const tools = [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
const ADD: AutomationStudioActionDeclaration = { consequences: [], control: { name: "Add to cart", kind: "button" }, verb: "press" };

/** The build's gate over a stand-in store, and how many times the instruction was read. */
function build() {
  let derived = 0;
  const domain = vi.fn(async (call: { callId: string; toolId: string; value: JsonObject; permission?: (declaration: AutomationStudioActionDeclaration) => Promise<unknown> }) => {
    if (call.value.replay !== undefined) {
      const code = call.value.replay === "verify" ? "core.replay.verified" : "core.replay.replayed";
      return { kind: "llm_evidence_tool_execution" as const, evidence: { replay: call.value.replay }, effectApplied: call.value.replay !== "verify", resultCode: code };
    }
    await call.permission?.(ADD);
    return {
      kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded",
      draft: { actionId: "web.click", effect: "mutate" as const, proposes: true, ranWith: { target: "Add to cart", consequences: [] }, replay: { from: ITEM } }
    };
  });
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: ["instruction.goal"],
    deriveInstructed: async () => { derived += 1; return READ; },
    executeTool: domain
  });
  // As the service builds it: one lazy read, only when a test first needs it.
  let lasting: Promise<ReadonlySet<string>> | undefined;
  const lastingActs = vi.fn(() => (lasting ??= permissions.instructedLastingActs(automationStudioInstructedActs(INSTRUCTION))));
  return { permissions, domain, lastingActs, derived: () => derived };
}

describe("a build whose step declares [] and claims an instructed lasting act", () => {
  it("never repeats either split-object mutation during two whole tests and still runs ordinary authored execution", async () => {
    const instruction = "Add two packs of Towels in Large and one pack of Napkins in Small to my cart. Do not buy anything.";
    const counts = new Map<string, number>();
    let reads = 0;
    const domain = vi.fn(async (call: { callId: string; toolId: string; value: JsonObject; permission?: (declaration: AutomationStudioActionDeclaration) => Promise<unknown> }) => {
      if (call.value.replay === "reset") return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      const target = String(call.value.target);
      if (call.value.replay === "verify") return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, said: "checked and not run" }, effectApplied: false, resultCode: "core.replay.verified" };
      await call.permission?.(ADD);
      counts.set(target, (counts.get(target) ?? 0) + 1);
      return {
        kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true,
        resultCode: call.value.replay === "step" ? "core.replay.replayed" : "web.action.succeeded",
        draft: { actionId: "example.add", effect: "mutate" as const, proposes: true, ranWith: { target, consequences: [] }, replay: { from: ITEM } }
      };
    });
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: [], instructionIds: ["instruction.goal"],
      deriveInstructed: async () => { reads += 1; return [{ ...READ[0]!, quote: instruction.split(".")[0]! }]; }, executeTool: domain
    });
    let lasting: Promise<ReadonlySet<string>> | undefined;
    const lastingActs = () => (lasting ??= permissions.instructedLastingActs(automationStudioInstructedActs(instruction)));
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "add.towels", toolId: "press", input: { target: "towels", consequences: [] }, add: true, act: "a1" })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "add.napkins", toolId: "press", input: { target: "napkins", consequences: [] }, add: true, act: "a2" })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: permissions.executeTool, maxIterations: 5, maxToolCalls: 5, propagateDecisionErrors: true, fullRunRequired: true, lastingActs });
    expect(result.ok).toBe(true);
    expect(Object.fromEntries(counts)).toEqual({ towels: 1, napkins: 1 });
    const test = automationStudioFlowDraftDryRunGate({ enabled: true, steps: result.steps.map((step) => ({ ...step })), executeTool: permissions.executeTool, accountEvidence: () => 0, showEvidence: () => undefined, targetMoved: () => undefined, lastingActs });
    expect(await test()).toBeUndefined();
    expect(Object.fromEntries(counts)).toEqual({ towels: 1, napkins: 1 });
    expect(domain.mock.calls.filter(([call]) => call.value.replay === "verify")).toHaveLength(4);
    expect(reads).toBe(1);
    // Classification protects build checks, never changes normal execution.
    await permissions.executeTool({ callId: "runtime.towels", toolId: "press", value: { target: "towels", consequences: [], replay: "step" } });
    expect(Object.fromEntries(counts)).toEqual({ towels: 2, napkins: 1 });
    expect(reads).toBe(1);
  });

  it("is checked in its dry run, not pressed again, and the instruction is read exactly once", async () => {
    const run = build();
    expect(automationStudioInstructedActs(INSTRUCTION).map((act) => act.id)).toEqual(["a1"]);
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "add.1", toolId: "press", input: { target: "Add to cart", consequences: [] }, add: true, act: "a1" })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: run.permissions.executeTool, maxIterations: 4, maxToolCalls: 4, propagateDecisionErrors: true, fullRunRequired: true, lastingActs: run.lastingActs
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.steps[0]).toMatchObject({ acts: ["a1"], replayed: { status: "replayed", mode: "verify", resultCode: "core.replay.verified" } });
    expect(run.domain.mock.calls.map(([call]) => [call.callId, call.value.replay ?? null])).toEqual([
      ["add.1", null],
      ["dryrun.1.reset", "reset"],
      ["dryrun.1.1", "verify"]
    ]);
    expect(run.derived()).toBe(1);

    // The judgement's own test after the round reads nothing new.
    const steps = result.steps.map((step) => ({ ...step }));
    const test = automationStudioFlowDraftDryRunGate({ enabled: true, steps, executeTool: run.permissions.executeTool, accountEvidence: () => 0, showEvidence: () => undefined, targetMoved: () => undefined, lastingActs: run.lastingActs });
    expect(await test()).toBeUndefined();
    expect(run.domain.mock.calls.at(-1)?.[0].value.replay).toBe("verify");

    // The cross-check after the build reuses the read: still one call, and `instructed()` is the same after it.
    expect(run.permissions.instructed()).toEqual(READ);
    await run.permissions.crossCheck();
    expect(run.permissions.instructed()).toEqual(READ);
    expect(run.derived()).toBe(1);
  });

  it("makes no read for a build that never reaches a test", async () => {
    const run = build();
    const decide = vi.fn().mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: run.permissions.executeTool, maxIterations: 2, maxToolCalls: 2, propagateDecisionErrors: true, lastingActs: run.lastingActs });
    expect(run.lastingActs).not.toHaveBeenCalled();
    expect(run.derived()).toBe(0);
  });
});
