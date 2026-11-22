// t973: a reply in words is only for conversation. The model's declaration (`intent`) and the shape of
// its answer decide; the person's words are never read. A reply to a task, or a reply that declares
// nothing, is asked again on the same model; still a reply, a declared task starts from the open page and
// anything else keeps the model's reply, so the person is never left with nothing.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../../framework/automation-service/panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../../commands/index.ts";
import {
  automationStudioConversationDeclaredIntent,
  automationStudioConversationUnansweredTask,
  automationStudioConversationUnansweredTaskDecision,
  interpretAutomationStudioConversationTurn,
  type AutomationStudioConversationDecisionContext,
  type AutomationStudioConversationModel,
  type AutomationStudioConversationModelRequest
} from "../index.ts";

const RUN_ONLY = parseAutomationStudioPanelCapabilities([{ id: "run.execute", title: "Run a Flow", summary: "Run the Flow now.", group: "Running", phrases: ["run it"], consequences: [], arguments: [] }]);
const WITH_CREATE_HERE = parseAutomationStudioPanelCapabilities([AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability, { id: "run.execute", title: "Run a Flow", summary: "Run the Flow now.", group: "Running", phrases: ["run it"], consequences: [], arguments: [] }]);
// A library's catalogue, a kind of site no realistic scenario uses.
const PAGE = "https://library.example.test/";
const MESSAGE = "List every atlas on the reserve shelf with its call number.";
const QUICK = { attempts: 3, attemptTimeoutMs: 1_000, deadlineMs: 5_000, backoffMs: 1 };

function context(overrides: Partial<AutomationStudioConversationDecisionContext> = {}): AutomationStudioConversationDecisionContext {
  return { projectId: "project.home", capabilities: WITH_CREATE_HERE, flows: [], onScreen: { pageUrl: PAGE }, message: MESSAGE, ...overrides };
}

function scripted(answers: readonly unknown[], seen: AutomationStudioConversationModelRequest[]): AutomationStudioConversationModel {
  return {
    name: "scripted",
    decide: async (request) => {
      seen.push(request);
      return answers[Math.min(seen.length - 1, answers.length - 1)];
    }
  };
}

describe("the declaration an answer opens with", () => {
  it("is read from the answer's object, as text or as an object", () => {
    expect(automationStudioConversationDeclaredIntent('{"intent": "task", "do": "flow.createHere"}')).toBe("task");
    expect(automationStudioConversationDeclaredIntent({ Intent: "Conversation", reply: "Hello." })).toBe("conversation");
    expect(automationStudioConversationDeclaredIntent('{"reply": "Hello."}')).toBeNull();
    expect(automationStudioConversationDeclaredIntent("Hello.")).toBeNull();
    expect(automationStudioConversationDeclaredIntent('{"intent": "maybe", "reply": "Hello."}')).toBeNull();
  });
});

describe("whether an answer leaves a task unanswered", () => {
  const reply = { kind: "reply" as const, text: "Would you like me to start it?" };

  it("lets a reply stand only when it declared conversation", () => {
    expect(automationStudioConversationUnansweredTask(reply, "conversation")).toBeNull();
    expect(automationStudioConversationUnansweredTask(reply, "task")).toMatchObject({ reason: "task_answered_in_words" });
    expect(automationStudioConversationUnansweredTask(reply, null)).toMatchObject({ reason: "reply_undeclared" });
  });

  it("never judges a capability chosen or one question back", () => {
    expect(automationStudioConversationUnansweredTask({ kind: "clarify", question: "Which shelf?" }, "task")).toBeNull();
    expect(automationStudioConversationUnansweredTask({ kind: "clarify", question: "Which shelf?" }, null)).toBeNull();
  });
});

describe("where a task still answered in words goes", () => {
  const reply = { kind: "reply" as const, text: "Shall I go ahead?" };

  it("starts a declared task from the open page, with the person's whole message", () => {
    expect(automationStudioConversationUnansweredTaskDecision({ reply, declaredTask: true, message: MESSAGE, context: context() }))
      .toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere", arguments: { instruction: MESSAGE } } });
  });

  it("keeps the model's reply when no task was declared, no page is open, or nothing starts one here", () => {
    expect(automationStudioConversationUnansweredTaskDecision({ reply, declaredTask: false, message: MESSAGE, context: context() })).toBe(reply);
    expect(automationStudioConversationUnansweredTaskDecision({ reply, declaredTask: true, message: MESSAGE, context: context({ onScreen: {} }) })).toBe(reply);
    expect(automationStudioConversationUnansweredTaskDecision({ reply, declaredTask: true, message: MESSAGE, context: context({ capabilities: RUN_ONLY }) })).toBe(reply);
  });
});

describe("the interpretation with the check", () => {
  it("takes a declared conversation's reply on the first attempt, with no climb", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const reading = await interpretAutomationStudioConversationTurn({ model: scripted(['{"intent": "conversation", "reply": "Glad to help."}'], seen), message: "thanks!", transcript: [], transcriptWithheld: false, context: context({ message: "thanks!" }), limits: QUICK });
    expect(reading).toMatchObject({ source: "model", attempts: 1, decision: { kind: "reply", text: "Glad to help." } });
    expect(seen[0]!.climb).toBeUndefined();
  });

  it("takes a start on the first attempt, declared or not", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const reading = await interpretAutomationStudioConversationTurn({ model: scripted(['{"do": "flow.createHere", "with": {"instruction": "x"}}'], seen), message: MESSAGE, transcript: [], transcriptWithheld: false, context: context(), limits: QUICK });
    expect(reading).toMatchObject({ attempts: 1, decision: { kind: "invoke", invocation: { capabilityId: "flow.createHere" } } });
  });

  it("retries on the same model throughout the turn, then answers with the model's reply when no task was ever declared and none can start", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const reading = await interpretAutomationStudioConversationTurn({ model: scripted(['{"reply": "Hello there."}'], seen), message: "hello", transcript: [], transcriptWithheld: false, context: context({ onScreen: {}, message: "hello" }), limits: QUICK });
    expect(reading).toMatchObject({ source: "model", attempts: 3, decision: { kind: "reply", text: "Hello there." } });
    expect(seen.map((request) => request.climb)).toEqual([undefined, undefined, undefined]);
  });

  it("settles on the same model's corrected declaration: a task it starts, a conversation it may answer", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const reading = await interpretAutomationStudioConversationTurn({ model: scripted(['{"intent": "task", "reply": "Shall I go ahead?"}', '{"intent": "conversation", "reply": "Nothing to do here."}'], seen), message: "hello", transcript: [], transcriptWithheld: false, context: context({ message: "hello" }), limits: QUICK });
    expect(reading).toMatchObject({ attempts: 2, decision: { kind: "reply", text: "Nothing to do here." } });
    expect(seen[1]!.climb).toBeUndefined();
    expect(seen[1]!.correction).toContain("A task is never answered in words");
  });
});
