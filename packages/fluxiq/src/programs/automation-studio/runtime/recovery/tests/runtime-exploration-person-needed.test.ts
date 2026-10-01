// A recovery exploration that meets a check only a person can complete never
// shows it to the repair model. It asks the person through the run's thread,
// waits, and either goes on from a fresh look or ends person-needed.
//
// Driven through the real evidence loop and the real harness-option registry,
// with a stand-in domain whose press or look reports `personNeeded` the way the
// web domain does for a robot check, a scripted provider that records every
// decision it was asked for, and a stand-in thread.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceTool, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS, type AutomationStudioAsk, type AutomationStudioAskAnswer, type AutomationStudioParkingPort } from "../../parking/index.ts";
import { resolveAutomationStudioExplorationBudget } from "../exploration-budget.ts";
import { automationStudioExplorationTraceEvent, runAutomationStudioRuntimeExploration } from "../runtime-exploration.ts";

/** What only the check's own result carries. Seen by a model, it is the defect. */
const CHECK_MARKER = "ROBOT_CHECK_ON_THIS_PAGE";

const TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "shop.look", description: "Read the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
  { toolId: "shop.press", description: "Press a control by its handle.", inputSchema: { type: "object" }, effect: "mutate" }
];

type Answer = AutomationStudioAskAnswer | undefined | "throw";

const choice = (value: string): AutomationStudioAskAnswer => ({ askId: "", answeredAt: 1, kind: "choice", value, actorId: "person" });

/** A thread that answers each question in turn with what it is given. */
function thread(answers: Answer[]) {
  const opened: AutomationStudioAsk[] = [];
  const waits: Array<{ expiresAtMs?: number }> = [];
  const port: AutomationStudioParkingPort = {
    open: (ask) => { opened.push(ask); },
    awaitAnswer: async (ask, wait) => {
      waits.push(wait);
      const answer = answers.shift();
      if (answer === "throw") throw new Error("The thread could not be read.");
      return answer === undefined ? undefined : { ...answer, askId: ask.askId };
    }
  };
  return { port, opened, waits };
}

function checkResult(): AutomationStudioLlmEvidenceToolExecutionResult {
  return {
    kind: "llm_evidence_tool_execution",
    evidence: { ok: false, code: "needs_person", page: CHECK_MARKER },
    effectApplied: true,
    resultCode: "shop.needs_person",
    personNeeded: true
  };
}

type Setup = {
  /** How many presses in a row meet a check. */
  pressChecks?: number;
  /** How many looks in a row meet a check, counting the free first look. */
  lookChecks?: number;
  decisions?: JsonObject[];
  answers?: Answer[];
  /** No thread at all. */
  noPort?: boolean;
};

async function explore(setup: Setup = {}) {
  const calls: Array<{ callId: string; toolId: string }> = [];
  const seenByModel: string[] = [];
  let pressChecks = setup.pressChecks ?? 1;
  let lookChecks = setup.lookChecks ?? 0;
  let looks = 0;
  const decisions = setup.decisions ?? [
    { kind: "tool_call", callId: "call.press", toolId: "shop.press", input: { handle: "c1" } },
    { kind: "complete", result: { findings: "The list is behind the Continue control." } }
  ];
  const registry = automationStudioHarnessOptionRegistry({
    binding: {
      domainId: "shop",
      deniedEvidenceKeys: [],
      tools: TOOLS,
      executeTool: async (input): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> => {
        calls.push({ callId: input.callId, toolId: input.toolId });
        if (input.toolId === "shop.look") {
          if (lookChecks > 0) { lookChecks -= 1; return checkResult(); }
          looks += 1;
          return { kind: "llm_evidence_tool_execution", evidence: { page: "the list", look: looks }, effectApplied: false };
        }
        if (pressChecks > 0) { pressChecks -= 1; return checkResult(); }
        return { kind: "llm_evidence_tool_execution", evidence: { page: "the list", pressed: String(input.value.handle) }, effectApplied: true };
      }
    }
  });
  const asks = thread(setup.answers ?? [choice("person_done")]);
  let providerCalls = 0;
  const exploration = await runAutomationStudioRuntimeExploration({
    loop: registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true }),
    decide: async (decision) => {
      seenByModel.push(JSON.stringify(decision.evidence));
      return decisions[providerCalls++] ?? { kind: "complete", result: {} };
    },
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
    permittedConsequences: [],
    ...(setup.noPort ? {} : { ask: { port: asks.port, timeoutMs: 30_000, now: () => 1_000 } }),
    now: () => 1_000
  });
  return { exploration, calls, seenByModel, opened: asks.opened, waits: asks.waits, providerCalls: () => providerCalls };
}

describe("a recovery exploration that meets a check only a person can complete", () => {
  it("asks the person instead of showing the model the check, and on Continue goes on from a fresh look", async () => {
    const run = await explore();

    // The question, as Core fixes it, raised at the recovery's stage.
    expect(run.opened).toHaveLength(1);
    expect(run.opened[0]).toMatchObject({ kind: "choice", parks: true, status: "pending", control: { kind: "person_check" }, raisedBy: { stage: "recovery" } });
    // Core's own person-needed wait, not the permission ask's thirty seconds.
    expect(run.waits).toEqual([{ expiresAtMs: 1_000 + AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS }]);
    // The free first look, the press that met the check, and the look after the person.
    expect(run.calls).toEqual([
      { callId: expect.any(String), toolId: "shop.look" },
      { callId: "call.press", toolId: "shop.press" },
      { callId: "call.press.look", toolId: "shop.look" }
    ]);
    // No decision the model was asked for carried anything of the check.
    expect(run.seenByModel.join("\n")).not.toContain(CHECK_MARKER);
    expect(run.seenByModel.join("\n")).not.toContain("needs_person");
    // The decision after the press was made against the fresh look.
    expect(run.seenByModel[1]).toContain("personCompletedCheck");
    expect(run.seenByModel[1]).toContain("\"look\":2");
    expect(run.exploration.outcome).toBe("evidence_gathered");
    expect(run.exploration.personNeeded).toEqual({ asks: 1 });
  });

  it("asks before the first decision when the free first look meets the check", async () => {
    const run = await explore({ pressChecks: 0, lookChecks: 1 });

    expect(run.opened).toHaveLength(1);
    expect(run.seenByModel.join("\n")).not.toContain(CHECK_MARKER);
    expect(run.seenByModel[0]).toContain("personCompletedCheck");
    expect(run.exploration.outcome).toBe("evidence_gathered");
  });

  it.each([
    ["Stop", [choice("person_stop")] as Answer[], "person_needed.stopped"],
    ["nobody answering in time", [undefined] as Answer[], "person_needed.timed_out"],
    ["a thread that could not be read", ["throw"] as Answer[], "person_needed.no_thread"]
  ])("ends person-needed on %s, and asks the model nothing further", async (_name, answers, code) => {
    const run = await explore({ answers });

    expect(run.exploration).toMatchObject({ outcome: "user_intervention_required", endedBy: code, personNeeded: { asks: 1 } });
    expect(run.exploration.stopReason).toBeUndefined();
    expect(run.exploration.permissionRequest).toBeUndefined();
    expect(run.exploration.result).toBeUndefined();
    // The one decision that chose the press, and none after it.
    expect(run.providerCalls()).toBe(1);
    expect(run.seenByModel.join("\n")).not.toContain(CHECK_MARKER);
    // No look after a refusal: the exploration is over.
    expect(run.calls.map((entry) => entry.callId)).not.toContain("call.press.look");

    const event = automationStudioExplorationTraceEvent({ requested: true, exploration: run.exploration });
    expect(event.status).toBe("refused");
    expect(event.detail).toMatchObject({ outcome: "user_intervention_required", endedBy: code, personNeeded: { asks: 1, ended: code } });
  });

  it("ends person-needed at once when there is no thread to ask in", async () => {
    const run = await explore({ noPort: true });

    expect(run.opened).toEqual([]);
    expect(run.exploration).toMatchObject({ outcome: "user_intervention_required", endedBy: "person_needed.no_thread" });
    expect(run.providerCalls()).toBe(1);
    expect(run.seenByModel.join("\n")).not.toContain(CHECK_MARKER);
  });

  it("asks at most three times, then ends person-needed", async () => {
    const run = await explore({
      pressChecks: 10,
      answers: [choice("person_done"), choice("person_done"), choice("person_done"), choice("person_done")],
      decisions: ["c1", "c2", "c3", "c4", "c5"].map((handle) => ({ kind: "tool_call", callId: `call.${handle}`, toolId: "shop.press", input: { handle } }))
    });

    expect(run.opened).toHaveLength(3);
    expect(run.exploration).toMatchObject({ outcome: "user_intervention_required", endedBy: "person_needed.asks_exhausted", personNeeded: { asks: 3, ended: "asks_exhausted" } });
    expect(run.seenByModel.join("\n")).not.toContain(CHECK_MARKER);
  });
});

describe("what a recovery says while it waits on the person", () => {
  /** The exploration run as a run's repair, and the ask rows it said, as [phase, ref, status, resolution]. */
  async function said(setup: Setup): Promise<{ rows: unknown[][]; askId: string | undefined }> {
    const seen: ClientGatewayActivity[] = [];
    const stop = automationStudioActivityHub.subscribe((event) => seen.push(event));
    try {
      const run = await runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "project.one" }, () => explore(setup));
      return { rows: seen.filter((event) => event.detail?.kind === "ask").map((event) => [event.phase, event.detail!.ref, event.detail!.status, event.detail!.resolution]), askId: run.opened[0]?.askId };
    } finally {
      stop();
    }
  }

  it.each([
    ["Continue", [choice("person_done")] as Answer[], "succeeded", "answered"],
    ["Stop", [choice("person_stop")] as Answer[], "failed", "declined"],
    ["nobody answering in time", [undefined] as Answer[], "failed", "timed_out"]
  ])("says the wait on the ask and its end on %s, in the repair's phase", async (_name, answers, status, resolution) => {
    const { rows, askId } = await said({ answers });
    expect(rows).toEqual([
      ["waiting_permission", askId, "started", undefined],
      ["repairing", askId, status, resolution]
    ]);
  });

  it("settles as cancelled when the thread could not be read", async () => {
    const { rows, askId } = await said({ answers: ["throw"] });
    expect(rows).toEqual([
      ["waiting_permission", askId, "started", undefined],
      ["repairing", askId, "failed", "cancelled"]
    ]);
  });
});
