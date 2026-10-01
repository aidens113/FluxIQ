// A recovery exploration that needs an action the run was not allowed ends
// there, carrying the request a person allows or refuses from.
//
// Driven through the real evidence loop and the real harness-option registry,
// with a stand-in domain that asks before a press that would move money and
// void the line -- what a domain is meant to do -- and a scripted provider.
//
// The press declares two classes the gate still asks about. It declared
// `move_money` and `modify_existing` until 2026-09-26, and an edit is no longer
// gated: on that pair the row below that permits "only part of it" would have
// permitted a class needing no permission, and proved nothing about a partial one.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../parking/index.ts";
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
  /**
   * How the person answers each question, in the order they are asked, when
   * there is a thread to ask in. One answer is the answer to every question.
   */
  answer?: Answer | readonly Answer[];
};

type Answer = "grant" | "deny" | "nobody";

/** The controls the stand-in order shows, by handle. */
const CONTROLS: Record<string, string> = { c4: "Refund and void line 1", c5: "Refund to store credit" };

/** A thread that records what it was asked and answers the way the row says. */
function thread(answers: Answer | readonly Answer[]): { port: AutomationStudioParkingPort; opened: AutomationStudioAsk[] } {
  const opened: AutomationStudioAsk[] = [];
  const answerTo = (index: number): Answer => typeof answers === "string" ? answers : answers[index] ?? "nobody";
  return {
    opened,
    port: {
      open: (ask) => { opened.push(ask); },
      awaitAnswer: async (ask): Promise<AutomationStudioAskAnswer | undefined> => {
        const answer = answerTo(opened.indexOf(ask));
        return answer === "nobody" ? undefined : { askId: ask.askId, kind: answer, value: null, answeredAt: 1_000, actorId: "person.one" };
      }
    }
  };
}

async function explore(options: Options = {}) {
  const pressed: string[] = [];
  // What each decision was shown, by call id.
  const shown: Array<Map<string, JsonValue>> = [];
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
          return { kind: "llm_evidence_tool_execution", evidence: { order: "ORD-40100", controls: Object.entries(CONTROLS).map(([handle, name]) => ({ handle, name })) }, effectApplied: false };
        }
        const handle = String(input.value.handle);
        const verdict = await input.permission({ consequences: ["move_money", "delete"], control: { name: CONTROLS[handle] ?? handle, kind: "button" }, verb: "press" });
        // What a domain is meant to tell the model: a person's no apart from a question still open.
        if (!verdict.permitted) {
          const code = verdict.declined ? "consequences_declined" : "permission_required";
          return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, handle }, effectApplied: false, resultCode: `shop.${code}` };
        }
        pressed.push(String(input.value.handle));
        return { kind: "llm_evidence_tool_execution", evidence: { order: "ORD-40100", status: "Partially refunded" }, effectApplied: true };
      }
    }
  });
  const asked = options.answer ? thread(options.answer) : undefined;
  const exploration = await runAutomationStudioRuntimeExploration({
    loop: registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true }),
    decide: async (decision) => {
      shown.push(new Map(decision.evidence.map((entry) => [entry.callId, entry.value])));
      return decisions[providerCalls++] ?? { kind: "complete", result: {} };
    },
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
    ...(options.gate ? { gate: options.gate } : {
      ...(options.permittedConsequences ? { permittedConsequences: options.permittedConsequences } : {}),
      instructionIds: ["instruction.refund"]
    }),
    ...(asked ? { ask: { port: asked.port, timeoutMs: 30_000, now: () => 1_000 } } : {}),
    now: () => 1_000
  });
  return { exploration, pressed, shown, providerCalls: () => providerCalls, opened: asked?.opened ?? [] };
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
      control: { name: "Refund and void line 1", kind: "button" },
      consequences: ["move_money", "delete"],
      missing: ["move_money", "delete"],
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

  it("takes the action when the run is permitted every consequence it has", async () => {
    const run = await explore({ permittedConsequences: ["move_money", "delete"] satisfies AutomationStudioActionConsequence[] });

    expect(run.pressed).toEqual(["c4"]);
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.permissionRequest).toBeUndefined();
  });

  it("asks for what is still missing when the run is permitted only part of it", async () => {
    const run = await explore({ permittedConsequences: ["delete"] });

    expect(run.pressed).toEqual([]);
    expect(run.exploration.permissionRequest?.missing).toEqual(["move_money"]);
  });

  it("does not read an unrecognised class as permitted", async () => {
    const run = await explore({ permittedConsequences: ["refund", "purchase"] });

    expect(run.pressed).toEqual([]);
    expect(run.exploration.outcome).toBe("user_intervention_required");
  });

  // A recovery builds one gate and hands it to the exploration, so the patch
  // stage after it reads the same request. The exploration uses that gate as
  // it is: its permitted consequences, its instructed set and what it has already been shown.
  it("checks every action against a gate the caller handed it, and leaves the request on that gate", async () => {
    const refusing = new AutomationStudioActionPermissionGate({ stage: "recovery", instructionIds: ["instruction.dispatch"] });
    refusing.observe({ controls: ["Refund and void line 1"] });
    const refused = await explore({ gate: refusing });

    expect(refused.pressed).toEqual([]);
    expect(refused.exploration.permissionRequest).toBe(refusing.request);
    expect(refusing.request).toMatchObject({ reason: { stage: "recovery", instructionIds: ["instruction.dispatch"] }, control: { name: "Refund and void line 1" } });

    // A person's permission, not the instruction, lets it press (the user's rule, 2026-09-30).
    const permitting = new AutomationStudioActionPermissionGate({ stage: "recovery", permittedConsequences: ["move_money", "delete"] });
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

describe("a repair that can put its question to a person", () => {
  it("asks in the run's thread, and carries on with the action once it is granted", async () => {
    const run = await explore({ answer: "grant" });

    expect(run.opened).toHaveLength(1);
    expect(run.opened[0]).toMatchObject({
      kind: "permission",
      parks: true,
      missing: ["move_money", "delete"],
      control: { name: "Refund and void line 1", kind: "button" },
      raisedBy: { stage: "recovery", definitionId: "shop.press" }
    });
    // The ask is keyed by the gate's own request id: one question, one key.
    expect(run.opened[0]?.askId).toBe(run.opened[0]?.permissionRequest?.requestId);
    // The whole point: the press happened, the exploration finished, and the
    // repair was not killed by a question the build path parks on.
    expect(run.pressed).toEqual(["c4"]);
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.permissionRequest).toBeUndefined();
  });

  // A no is an answer, not silence (2026-10-01; the build path since t195-w18).
  // Until then the first decline ended the repair on a request the person had
  // already refused, and no later question could be asked.
  it("tells the model the person declined and goes on, without taking the action", async () => {
    const run = await explore({ answer: "deny" });

    expect(run.opened).toHaveLength(1);
    expect(run.pressed).toEqual([]);
    // The decision after the press was shown the refusal as a decline.
    expect(run.providerCalls()).toBe(3);
    expect(run.shown[2]?.get("call.refund")).toEqual({ ok: false, code: "consequences_declined", handle: "c4" });
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.permissionRequest).toBeUndefined();
  });

  it("asks about a different control after a decline, and takes it once granted", async () => {
    const run = await explore({
      answer: ["deny", "grant"],
      decisions: [
        { kind: "tool_call", callId: "call.look", toolId: "shop.look", input: {} },
        { kind: "tool_call", callId: "call.refund", toolId: "shop.press", input: { handle: "c4" } },
        { kind: "tool_call", callId: "call.credit", toolId: "shop.press", input: { handle: "c5" } },
        { kind: "complete", result: { findings: "Refunded to store credit." } }
      ]
    });

    expect(run.opened.map((ask) => ask.control?.name)).toEqual(["Refund and void line 1", "Refund to store credit"]);
    expect(run.opened[0]?.askId).not.toBe(run.opened[1]?.askId);
    expect(run.pressed).toEqual(["c5"]);
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.permissionRequest).toBeUndefined();
  });

  it("refuses the declined control again without asking", async () => {
    const run = await explore({
      answer: "deny",
      decisions: [
        { kind: "tool_call", callId: "call.look", toolId: "shop.look", input: {} },
        { kind: "tool_call", callId: "call.refund", toolId: "shop.press", input: { handle: "c4" } },
        { kind: "tool_call", callId: "call.refund.again", toolId: "shop.press", input: { handle: "c4", retry: true } },
        { kind: "complete", result: { findings: "The person declined the refund." } }
      ]
    });

    expect(run.opened).toHaveLength(1);
    expect(run.pressed).toEqual([]);
    expect(run.shown[3]?.get("call.refund.again")).toEqual({ ok: false, code: "consequences_declined", handle: "c4" });
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.permissionRequest).toBeUndefined();
  });

  it("ends on the request when nobody answers, having asked once", async () => {
    const run = await explore({
      answer: "nobody",
      decisions: [
        { kind: "tool_call", callId: "call.look", toolId: "shop.look", input: {} },
        { kind: "tool_call", callId: "call.refund", toolId: "shop.press", input: { handle: "c4" } },
        { kind: "tool_call", callId: "call.credit", toolId: "shop.press", input: { handle: "c5" } },
        { kind: "complete", result: { findings: "Refunded to store credit." } }
      ]
    });

    expect(run.opened).toHaveLength(1);
    expect(run.pressed).toEqual([]);
    // Ended on the first unanswered question: the model was not asked again.
    expect(run.providerCalls()).toBe(2);
    expect(run.exploration).toMatchObject({ outcome: "user_intervention_required", stopReason: "operator_approval_required", endedBy: "operator_approval_required" });
    expect(run.exploration.permissionRequest).toBeDefined();
  });
});

describe("what a repair says while it waits on a permission", () => {
  it.each([
    ["grant", "succeeded", "allowed"],
    ["deny", "failed", "declined"],
    ["nobody", "failed", "timed_out"]
  ] as const)("says the wait on the request and its end when the answer is %s", async (answer, status, resolution) => {
    const seen: ClientGatewayActivity[] = [];
    const stop = automationStudioActivityHub.subscribe((event) => seen.push(event));
    try {
      const run = await runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "project.one" }, () => explore({ answer }));
      const requestId = run.opened[0]!.askId;
      expect(seen.filter((event) => event.detail?.kind === "ask").map((event) => [event.phase, event.detail!.ref, event.detail!.title, event.detail!.status, event.detail!.resolution])).toEqual([
        ["waiting_permission", requestId, "Asked a question (permission)", "started", undefined],
        ["repairing", requestId, "Asked a question (permission)", status, resolution]
      ]);
    } finally {
      stop();
    }
  });
});
