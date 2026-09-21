// A recovery exploration that needs an action the run was not allowed ends
// there, carrying the request a person grants or refuses from.
//
// Driven through the real evidence loop and the real harness-option registry,
// with a stand-in domain that asks before a press that would move money --
// what a domain is meant to do -- and a scripted provider.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import { resolveAutomationStudioExplorationBudget } from "../exploration-budget.ts";
import { automationStudioExplorationTraceEvent, runAutomationStudioRuntimeExploration } from "../runtime-exploration.ts";

const TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "shop.look", description: "Read the order in view.", inputSchema: { type: "object" }, effect: "observe" },
  { toolId: "shop.press", description: "Press a control by its handle.", inputSchema: { type: "object" }, effect: "mutate" }
];

type Options = {
  permittedConsequences?: readonly string[];
  decisions?: JsonObject[];
  /** The caller's own gate, handed in whole instead of the fields that build one. */
  gate?: AutomationStudioActionPermissionGate;
};

async function explore(options: Options = {}) {
  const pressed: string[] = [];
  let providerCalls = 0;
  const decisions = options.decisions ?? [
    { kind: "tool_call", callId: "call.look", toolId: "shop.look", input: {} },
    { kind: "tool_call", callId: "call.refund", toolId: "shop.press", input: { handle: "c4" } },
    { kind: "complete", result: { findings: "The refund went through." } }
  ];
  const registry = automationStudioHarnessOptionRegistry({
    binding: {
      domainId: "shop",
      deniedEvidenceKeys: [],
      tools: TOOLS,
      executeTool: async (input) => {
        if (input.toolId === "shop.look") {
          return { kind: "llm_evidence_tool_execution", evidence: { order: "ORD-40100", controls: [{ handle: "c4", name: "Refund line 1" }] }, effectApplied: false };
        }
        const verdict = await input.permission({ consequences: ["move_money", "modify_existing"], control: { name: "Refund line 1", kind: "button" }, verb: "press" });
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false, resultCode: "shop.permission_required" };
        pressed.push(String(input.value.handle));
        return { kind: "llm_evidence_tool_execution", evidence: { order: "ORD-40100", status: "Partially refunded" }, effectApplied: true };
      }
    }
  });
  const exploration = await runAutomationStudioRuntimeExploration({
    loop: registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true }),
    decide: async () => decisions[providerCalls++] ?? { kind: "complete", result: {} },
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
    ...(options.gate ? { gate: options.gate } : {
      ...(options.permittedConsequences ? { permittedConsequences: options.permittedConsequences } : {}),
      instructionIds: ["instruction.refund"]
    }),
    now: () => 1_000
  });
  return { exploration, pressed, providerCalls: () => providerCalls };
}

describe("a recovery exploration that needs permission", () => {
  it("stops at the first action the run was not allowed, carrying the request, and never takes it", async () => {
    const run = await explore();

    expect(run.pressed).toEqual([]);
    expect(run.exploration).toMatchObject({
      outcome: "user_intervention_required",
      stopReason: "operator_approval_required",
      endedBy: "operator_approval_required",
      refusedActions: 1
    });
    expect(run.exploration.result).toBeUndefined();
    expect(run.exploration.permissionRequest).toMatchObject({
      action: { kind: "exploration_step", id: "shop.press", ref: "call.refund", verb: "press" },
      control: { name: "Refund line 1", kind: "button" },
      consequences: ["move_money", "modify_existing"],
      missing: ["move_money", "modify_existing"],
      reason: { stage: "recovery", instructionIds: ["instruction.refund"] }
    });
    expect(run.exploration.reason).toBe(run.exploration.permissionRequest!.sentence);
    // Terminal: the model is not asked what to try instead.
    expect(run.providerCalls()).toBe(2);
  });

  it("puts the request in the recovery trace, where a person can be shown it", async () => {
    const run = await explore();
    const event = automationStudioExplorationTraceEvent({ requested: true, exploration: run.exploration });

    expect(event.status).toBe("refused");
    expect(event.detail).toMatchObject({ outcome: "user_intervention_required", stopReason: "operator_approval_required", permissionRequest: run.exploration.permissionRequest });
  });

  it("takes the action when the run's grant holds every consequence it has", async () => {
    const run = await explore({ permittedConsequences: ["move_money", "modify_existing"] satisfies AutomationStudioActionConsequence[] });

    expect(run.pressed).toEqual(["c4"]);
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.permissionRequest).toBeUndefined();
  });

  it("asks for what is still missing when the grant holds only part of it", async () => {
    const run = await explore({ permittedConsequences: ["modify_existing"] });

    expect(run.pressed).toEqual([]);
    expect(run.exploration.permissionRequest?.missing).toEqual(["move_money"]);
  });

  it("does not read an unrecognised class as a grant", async () => {
    const run = await explore({ permittedConsequences: ["refund", "purchase"] });

    expect(run.pressed).toEqual([]);
    expect(run.exploration.outcome).toBe("user_intervention_required");
  });

  // A recovery builds one gate and hands it to the exploration, so the patch
  // stage after it reads the same request. The exploration uses that gate as
  // it is: its grant, its instructed set and what it has already been shown.
  it("checks every action against a gate the caller handed it, and leaves the request on that gate", async () => {
    const refusing = new AutomationStudioActionPermissionGate({ stage: "recovery", instructionIds: ["instruction.dispatch"] });
    refusing.observe({ controls: ["Refund line 1"] });
    const refused = await explore({ gate: refusing });

    expect(refused.pressed).toEqual([]);
    expect(refused.exploration.permissionRequest).toBe(refusing.request);
    expect(refusing.request).toMatchObject({ reason: { stage: "recovery", instructionIds: ["instruction.dispatch"] }, control: { name: "Refund line 1" } });

    const permitting = new AutomationStudioActionPermissionGate({ stage: "recovery", instructed: [
      { consequence: "move_money", instructionId: "instruction.refund", instructionDigest: `sha256:${"0".repeat(64)}`, quote: "refund the damaged line" },
      { consequence: "modify_existing", instructionId: "instruction.refund", instructionDigest: `sha256:${"0".repeat(64)}`, quote: "refund the damaged line" }
    ] });
    const permitted = await explore({ gate: permitting });

    expect(permitted.pressed).toEqual(["c4"]);
    expect(permitting.request).toBeUndefined();
  });

  it("refuses a gate handed in together with the fields that would build a second one, before anything runs", async () => {
    const gate = new AutomationStudioActionPermissionGate({ stage: "recovery" });
    let decided = 0;
    for (const loose of [{ permittedConsequences: ["move_money"] }, { instructionIds: ["instruction.refund"] }, { shownEvidence: [{ order: "ORD-40100" }] }]) {
      await expect(runAutomationStudioRuntimeExploration({
        loop: { tools: TOOLS, executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false }) },
        decide: async () => { decided += 1; return { kind: "complete", result: {} }; },
        budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
        gate,
        ...loose
      })).rejects.toThrow(/permission gate or the fields that build one/);
    }
    expect(decided).toBe(0);
  });

  // Only the gate raises the reason, because only the gate holds a request to
  // raise it with. A domain's own code read as one is a refusal nobody can
  // answer, and is reported as the refusal it is.
  it("reports a domain code read as operator approval as the refusal it is", async () => {
    const refused = await runAutomationStudioRuntimeExploration({
      loop: {
        tools: TOOLS,
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "shop.approval" }, effectApplied: false, resultCode: "shop.approval" })
      },
      decide: async () => ({ kind: "tool_call", callId: "call.one", toolId: "shop.look", input: {} }),
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000, maxRefusedActions: 1 }),
      classifyRefusal: () => "operator_approval_required",
      now: () => 1_000
    });

    expect(refused).toMatchObject({ outcome: "unsafe_action_blocked", stopReason: "destructive_action_refused" });
    expect(refused.permissionRequest).toBeUndefined();
  });
});
