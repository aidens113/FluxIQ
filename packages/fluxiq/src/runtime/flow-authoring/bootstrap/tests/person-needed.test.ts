// The build's hand-off of a check to the person, driven against a stand-in
// executor and a stand-in thread, so every way the question can come out is
// reachable in milliseconds. The wiring into a real build is
// `../../tests/service-bootstrap/tests/person-needed.test.ts`.

import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES, automationStudioFlowDraftReplayClearedCode, type AutomationStudioLlmEvidenceTool, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS, AUTOMATION_STUDIO_PERSON_NEEDED_TEXT, type AutomationStudioAsk, type AutomationStudioAskAnswer, type AutomationStudioParkingPort } from "../../../automation-parking/index.ts";
import { parseAutomationStudioFlowBootstrapFailureDiagnostic } from "../generation-failure/index.ts";
import { automationStudioFlowBootstrapPersonNeeded } from "../person-needed.ts";

const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "example.look", description: "Look.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: { fresh: true } } };
const ACT: AutomationStudioLlmEvidenceTool = { toolId: "example.act", description: "Act.", inputSchema: { type: "object" }, effect: "mutate" };
const CHECK_EVIDENCE = { ok: false, code: "USER_INTERVENTION_REQUIRED", check: "robot" };

/** An action that meets a check, as a domain reports it: the step described as it would stand once cleared. */
function checkResult(): AutomationStudioLlmEvidenceToolExecutionResult {
  return {
    kind: "llm_evidence_tool_execution",
    evidence: CHECK_EVIDENCE,
    effectApplied: true,
    resultCode: "example.user_intervention_required",
    resultReason: "robot_check",
    personNeeded: true,
    nodeId: "example.open",
    stateDigests: { before: "state.before", after: "state.check" },
    draft: { actionId: "example.open", input: { to: "the list" }, effect: "mutate", proposes: true }
  };
}

type Answer = AutomationStudioAskAnswer | undefined | "throw";

/** A thread that answers each question in turn with what it is given. */
function thread(answers: Answer[], options: { canWait?: boolean } = {}) {
  const opened: AutomationStudioAsk[] = [];
  const waits: Array<{ expiresAtMs?: number }> = [];
  const port: AutomationStudioParkingPort = {
    open: (ask) => { opened.push(ask); },
    ...(options.canWait === false ? {} : {
      awaitAnswer: async (ask: AutomationStudioAsk, wait: { expiresAtMs?: number }) => {
        waits.push(wait);
        const answer = answers.shift();
        if (answer === "throw") throw new Error("The thread could not be read.");
        return answer === undefined ? undefined : { ...answer, askId: ask.askId };
      }
    })
  };
  return { port, opened, waits };
}

const choice = (value: string): AutomationStudioAskAnswer => ({ askId: "", answeredAt: 1, kind: "choice", value, actorId: "person" });

/** An executor whose action meets a check `checks` times in a row, and whose look reads what is there now. */
function executor(options: { checks?: number; lookChecks?: number } = {}) {
  const calls: Array<{ callId: string; toolId: string; value: JsonObject }> = [];
  let checks = options.checks ?? 1;
  let lookChecks = options.lookChecks ?? 0;
  return {
    calls,
    executeTool: async (call: { callId: string; toolId: string; value: JsonObject }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> => {
      calls.push({ callId: call.callId, toolId: call.toolId, value: call.value });
      if (call.toolId === LOOK.toolId) {
        if (lookChecks > 0) { lookChecks -= 1; return checkResult(); }
        return { kind: "llm_evidence_tool_execution", evidence: { saw: "the list" }, effectApplied: false, stateDigests: { before: "state.after", after: "state.after" } };
      }
      if (checks > 0) { checks -= 1; return checkResult(); }
      return { kind: "llm_evidence_tool_execution", evidence: { opened: true }, effectApplied: true, resultCode: "example.opened" };
    }
  };
}

const call = (value: JsonObject = { to: "the list" }) => ({ callId: "call.1", toolId: ACT.toolId, value });

describe("a build tool result that needs a person", () => {
  it("passes every other result through untouched", async () => {
    const domain = executor({ checks: 0 });
    const asks = thread([]);
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: domain.executeTool, tools: [LOOK, ACT], ask: { port: asks.port } });
    await expect(wrapped.executeTool(call())).resolves.toEqual({ kind: "llm_evidence_tool_execution", evidence: { opened: true }, effectApplied: true, resultCode: "example.opened" });
    expect(asks.opened).toEqual([]);
    expect(wrapped.endedOnIntervention()).toBeUndefined();
  });

  it("asks the person in the thread, and on Continue the step stands with a fresh look in place of the check", async () => {
    const domain = executor();
    const asks = thread([choice("person_done")]);
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: domain.executeTool, tools: [LOOK, ACT], ask: { port: asks.port, now: () => 1_000 }, newAskId: () => "person-needed.1" });

    const result = await wrapped.executeTool(call());

    // The question, as the contract fixes it, keyed as the build named it.
    expect(asks.opened).toHaveLength(1);
    expect(asks.opened[0]).toMatchObject({
      askId: "person-needed.1", kind: "choice", parks: true, status: "pending", onTimeout: "deny",
      text: AUTOMATION_STUDIO_PERSON_NEEDED_TEXT,
      control: { kind: "person_check" },
      options: [{ id: "person_done", label: "Continue", route: null }, { id: "person_stop", label: "Stop", route: "failed" }],
      raisedBy: { stage: "authoring" }
    });
    expect(asks.waits).toEqual([{ expiresAtMs: 1_000 + AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS }]);
    // The look ran after the answer, with the look's own argument.
    expect(domain.calls.map((entry) => [entry.toolId, entry.value])).toEqual([[ACT.toolId, { to: "the list" }], [LOOK.toolId, { fresh: true }]]);
    // The step stands as the domain described it once cleared; nothing about the check survives.
    expect(result).toEqual({
      kind: "llm_evidence_tool_execution",
      evidence: expect.objectContaining({ personCompletedCheck: true, saw: "the list" }),
      effectApplied: true,
      nodeId: "example.open",
      stateDigests: { before: "state.before", after: "state.after" },
      draft: { actionId: "example.open", input: { to: "the list" }, effect: "mutate", proposes: true }
    });
    expect(JSON.stringify(result)).not.toContain("USER_INTERVENTION_REQUIRED");
    expect((result as { personNeeded?: unknown }).personNeeded).toBeUndefined();
    expect(wrapped.signal.aborted).toBe(false);
    expect(wrapped.endedOnIntervention()).toBeUndefined();
  });

  // Run `run-mw0jw263-0251c104`: a Next page that moved the list met a check on the way, and a domain
  // reports such a call as the refusal it was when the check stopped it. The step stood with
  // `effectApplied: false`, so the draft called a working step did_not_work and left it out of the Flow.
  it("a call that went out stands as having acted, whatever the refusal said when the check stopped it", async () => {
    const stoppedBy = (effect: "mutate" | "observe"): AutomationStudioLlmEvidenceToolExecutionResult => ({
      ...checkResult(),
      effectApplied: false,
      draft: { actionId: "example.open", input: { to: "the list" }, effect, proposes: effect === "mutate" }
    });
    const cleared = async (effect: "mutate" | "observe") => {
      const domain = executor();
      const executeTool: typeof domain.executeTool = async (entry) => entry.toolId === ACT.toolId ? stoppedBy(effect) : await domain.executeTool(entry);
      const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool, tools: [LOOK, ACT], ask: { port: thread([choice("person_done")]).port } });
      return await wrapped.executeTool(call()) as AutomationStudioLlmEvidenceToolExecutionResult;
    };
    expect((await cleared("mutate")).effectApplied).toBe(true);
    // One the check stopped before anything went out stands as the look it is, and changed nothing.
    expect((await cleared("observe")).effectApplied).toBe(false);
  });

  it("asks again when the look still meets a check, within the same bound", async () => {
    const domain = executor({ lookChecks: 1 });
    const asks = thread([choice("person_done"), choice("person_done")]);
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: domain.executeTool, tools: [LOOK, ACT], ask: { port: asks.port } });
    const result = await wrapped.executeTool(call()) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(asks.opened).toHaveLength(2);
    expect(result.evidence).toMatchObject({ personCompletedCheck: true, saw: "the list" });
  });

  it.each([
    ["Stop", [choice("person_stop")] as Answer[], "person_needed.stopped"],
    ["nobody answering in time", [undefined] as Answer[], "person_needed.timed_out"],
    ["a thread that could not be read", ["throw"] as Answer[], "person_needed.no_thread"]
  ])("ends the build on %s, and shows the model nothing", async (_name, answers, issueCode) => {
    const domain = executor();
    const asks = thread(answers);
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: domain.executeTool, tools: [LOOK, ACT], ask: { port: asks.port } });

    await expect(wrapped.executeTool(call())).rejects.toThrow(/stopped for a person/);
    expect(wrapped.signal.aborted).toBe(true);
    // No look after a refusal: the build is over.
    expect(domain.calls.map((entry) => entry.toolId)).toEqual([ACT.toolId]);
    const ending = wrapped.endedOnIntervention();
    expect(ending?.diagnostic).toMatchObject({ code: "flow_bootstrap.user_intervention_required", retryable: false, issueCodes: [issueCode] });
    // What Core writes, Core reads back.
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(JSON.parse(JSON.stringify(ending!.diagnostic)))).toEqual(ending!.diagnostic);
  });

  it("ends the build at once when there is no thread to ask in", async () => {
    const domain = executor();
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: domain.executeTool, tools: [LOOK, ACT] });
    await expect(wrapped.executeTool(call())).rejects.toThrow(/stopped for a person/);
    expect(wrapped.endedOnIntervention()?.diagnostic.issueCodes).toEqual(["person_needed.no_thread"]);
  });

  it("ends the build when the thread cannot hold the work while it waits", async () => {
    const domain = executor();
    const asks = thread([], { canWait: false });
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: domain.executeTool, tools: [LOOK, ACT], ask: { port: asks.port } });
    await expect(wrapped.executeTool(call())).rejects.toThrow(/stopped for a person/);
    expect(wrapped.endedOnIntervention()?.diagnostic.issueCodes).toEqual(["person_needed.no_thread"]);
  });

  it("caps how long it waits, whatever the caller asks for", async () => {
    const asks = thread([choice("person_done")]);
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: executor().executeTool, tools: [LOOK, ACT], ask: { port: asks.port, timeoutMs: 3_600_000, now: () => 0 } });
    await wrapped.executeTool(call());
    expect(asks.waits).toEqual([{ expiresAtMs: AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS }]);
  });

  it("asks at most as often as it may in a row about a check that stays, then ends the build", async () => {
    // Continue each time, and every look after it still meets the check.
    const domain = executor({ checks: 1, lookChecks: 5 });
    const asks = thread([choice("person_done"), choice("person_done"), choice("person_done")]);
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: domain.executeTool, tools: [LOOK, ACT], ask: { port: asks.port }, maxAsks: 2 });
    await expect(wrapped.executeTool(call())).rejects.toThrow(/stopped for a person/);
    expect(asks.opened).toHaveLength(2);
    expect(wrapped.endedOnIntervention()?.diagnostic.issueCodes).toEqual(["person_needed.asks_exhausted"]);
  });

  it("asks at every fresh check a person clears, however many, and each call stands in place", async () => {
    // run-mwa19obz-abd5d558: the site put a new check in front of every few loads. Each was cleared; the fourth was
    // never put to anyone, the round threw, and the next round started again from the check left on the page.
    const domain = executor({ checks: 5 });
    const asks = thread(Array.from({ length: 5 }, () => choice("person_done")));
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: domain.executeTool, tools: [LOOK, ACT], ask: { port: asks.port }, maxAsks: 2 });
    for (let each = 0; each < 5; each += 1) {
      const result = await wrapped.executeTool(call()) as AutomationStudioLlmEvidenceToolExecutionResult;
      expect(result.evidence).toMatchObject({ personCompletedCheck: true, saw: "the list" });
    }
    expect(asks.opened).toHaveLength(5);
    expect(wrapped.signal.aborted).toBe(false);
    expect(wrapped.endedOnIntervention()).toBeUndefined();
  });

  it("answers a replayed step in the replay's own words once the person has cleared the check", async () => {
    // The dry run reads only `core.replay.*`: a step whose replay met a check
    // and was cleared ran, and must not be counted failed or unreproducible.
    const asks = thread([choice("person_done")]);
    const wrapped = automationStudioFlowBootstrapPersonNeeded({ executeTool: executor().executeTool, tools: [LOOK, ACT], ask: { port: asks.port }, clearedResultCode: automationStudioFlowDraftReplayClearedCode });
    const result = await wrapped.executeTool(call({ to: "the list", replay: "step" })) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(result.resultCode).toBe(AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed);
    expect(asks.opened).toHaveLength(1);
  });
});
