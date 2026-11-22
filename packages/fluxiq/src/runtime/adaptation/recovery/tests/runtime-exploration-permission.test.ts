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

import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionConsequence } from "../../../action-permission-requests/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../../automation-parking/index.ts";
import { automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
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
  it("refuses an uncovered action as evidence and continues without asking or taking it", async () => {
    const run = await explore();

    expect(run.pressed).toEqual([]);
    expect(run.exploration).toMatchObject({
      outcome: "evidence_gathered",
      endedBy: "exploration.completed",
      refusedActions: 1
    });
    expect(run.exploration.permissionRequest).toBeUndefined();
    expect(run.providerCalls()).toBe(3);
    expect(run.shown[2]?.get("call.refund")).toEqual({ ok: false, code: "permission_required", handle: "c4" });
  });

  it("records the refused action without publishing an unanswered permission question", async () => {
    const run = await explore();
    const event = automationStudioExplorationTraceEvent({ requested: true, exploration: run.exploration });

    expect(event.detail).toMatchObject({ outcome: "evidence_gathered", refusedActions: 1 });
    expect(event.detail).not.toHaveProperty("permissionRequest");
  });

  it("takes the action when the run is permitted every consequence it has", async () => {
    const run = await explore({ permittedConsequences: ["move_money", "delete"] satisfies AutomationStudioActionConsequence[] });

    expect(run.pressed).toEqual(["c4"]);
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.permissionRequest).toBeUndefined();
  });

  it("refuses what is still missing when the run is permitted only part of it", async () => {
    const run = await explore({ permittedConsequences: ["delete"] });

    expect(run.pressed).toEqual([]);
    expect(run.exploration.permissionRequest).toBeUndefined();
    expect(run.exploration.outcome).toBe("evidence_gathered");
  });

  it("does not read an unrecognised class as permitted", async () => {
    const run = await explore({ permittedConsequences: ["refund", "purchase"] });

    expect(run.pressed).toEqual([]);
    expect(run.exploration.outcome).toBe("evidence_gathered");
  });

  // A recovery builds one gate and hands it to the exploration, so the patch
  // stage after it reads the same request. The exploration uses that gate as
  // it is: its permitted consequences, its instructed set and what it has already been shown.
  it("checks every action against the caller's gate without raising a mid-run request", async () => {
    const refusing = new AutomationStudioActionPermissionGate({ stage: "recovery", instructionIds: ["instruction.dispatch"] });
    refusing.observe({ controls: ["Refund and void line 1"] });
    const refused = await explore({ gate: refusing });

    expect(refused.pressed).toEqual([]);
    expect(refused.exploration.permissionRequest).toBe(refusing.request);
    expect(refusing.request).toBeUndefined();
    expect(refusing.declarations).toContainEqual(expect.objectContaining({ consequences: ["move_money", "delete"], permitted: false }));

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

// A repair runs inside a Flow's run, so it never puts a permission question to a person (t976; the
// user's rule: a dangerous act asks only when a Flow or chat starts). Until t976 a bound thread was
// asked and the repair waited for the answer. What the person already answered in the Flow's chat
// reaches the run as what it may do, or as a no the gate holds.
describe("a repair inside a Flow's run never asks mid-Flow", () => {
  it("continues after refusing with a thread bound, and asks nothing there", async () => {
    const run = await explore({ answer: "grant" });

    expect(run.opened).toEqual([]);
    expect(run.pressed).toEqual([]);
    expect(run.providerCalls()).toBe(3);
    expect(run.exploration).toMatchObject({ outcome: "evidence_gathered", endedBy: "exploration.completed" });
    expect(run.exploration.permissionRequest).toBeUndefined();
  });

  it("takes the action the chat already allowed, unasked", async () => {
    const run = await explore({ answer: "grant", permittedConsequences: ["move_money", "delete"] });

    expect(run.opened).toEqual([]);
    expect(run.pressed).toEqual(["c4"]);
    expect(run.exploration.outcome).toBe("evidence_gathered");
  });

  it("tells the model the chat's no, without asking or taking the action, and goes on", async () => {
    const gate = new AutomationStudioActionPermissionGate({ stage: "recovery", endsOnRequest: false });
    gate.holdAnswer({ granted: [], declined: ["move_money", "delete"], requestId: "permission-request:chat" });
    const run = await explore({ answer: "grant", gate });

    expect(run.opened).toEqual([]);
    expect(run.pressed).toEqual([]);
    expect(run.providerCalls()).toBe(3);
    expect(run.shown[2]?.get("call.refund")).toEqual({ ok: false, code: "consequences_declined", handle: "c4" });
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.permissionRequest).toBeUndefined();
  });
});
