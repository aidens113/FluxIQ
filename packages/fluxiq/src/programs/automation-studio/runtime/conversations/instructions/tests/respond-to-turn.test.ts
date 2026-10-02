// A person's turn read as an instruction and answered in a real thread, with a
// scripted model. What is pinned: the person's turn is stored before anything
// can fail, every message gets an answer in the thread, a delete waits on a
// confirmation carrying exactly what it would run, and ordinary work does not.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/index.ts";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { AutomationStudioConversations } from "../../conversations.ts";
import { AUTOMATION_STUDIO_PANEL_CAPABILITY_ATTACHMENT, type AutomationStudioConversationModel } from "../index.ts";

// Its own directory per case: a fixed path under the working directory was
// shared by every run of this file in the checkout, so two runs at once
// deleted and overwrote each other's data.
let rootDir = "";
const PROJECT = "project.home";
const FLOWS = [{ flowId: "flow.kettle-1", name: "Kettle price checker" }, { flowId: "flow.toaster-2", name: "Toaster stock watch" }];
const CAPABILITIES = parseAutomationStudioPanelCapabilities([
  {
    id: "run.execute",
    title: "Run a Flow",
    summary: "Run the Flow now.",
    phrases: ["run the flow"],
    consequences: ["create_new"],
    arguments: [{ name: "projectId", required: true }, { name: "flowId", required: true }]
  },
  {
    id: "flow.delete",
    title: "Delete a Flow",
    summary: "Remove the Flow.",
    phrases: ["delete the flow"],
    consequences: ["delete"],
    arguments: [{ name: "projectId", required: true }, { name: "flowId", required: true }, { name: "authorizationPin", required: true }]
  }
]);
const QUICK = { attempts: 2, attemptTimeoutMs: 1_000, deadlineMs: 2_000, backoffMs: 1 };

let pool: AutomationStudioProjectDatabasePool | undefined;

function scripted(...answers: unknown[]): AutomationStudioConversationModel {
  return {
    name: "scripted",
    decide: async () => {
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer;
    }
  };
}

async function thread(model: AutomationStudioConversationModel | null) {
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const conversations = new AutomationStudioConversations(pool).bindModel(model);
  const opened = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null });
  const say = (text: string) => conversations.respondToPersonTurn({
    projectId: PROJECT,
    conversationId: opened.conversationId,
    text,
    actorId: "user.aiden",
    capabilities: CAPABILITIES,
    flows: FLOWS,
    onScreen: {},
    limits: QUICK
  });
  const turns = async () => (await conversations.getConversation({ projectId: PROJECT, conversationId: opened.conversationId }))?.turns ?? [];
  const record = (text: string) => conversations.appendTurn({ projectId: PROJECT, conversationId: opened.conversationId, text, attachment: { kind: "panel-capability-result", ref: "run.execute" } });
  return { say, turns, record };
}

describe("a person's turn, answered in the thread", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-conversation-instructions-test-"));
  });

  afterEach(async () => {
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("runs ordinary work straight away and says what it is doing", async () => {
    const { say, turns } = await thread(scripted('{"do": "run.execute", "with": {"flow": "kettle"}}'));
    const answer = await say("run my kettle flow");

    expect(answer.problem).toBeNull();
    expect(answer.response).toMatchObject({ runNow: true, askId: null, decision: { kind: "invoke", invocation: { capabilityId: "run.execute", arguments: { flowId: "flow.kettle-1" } } } });
    const [person, automation] = await turns();
    expect(person).toMatchObject({ author: "person", text: "run my kettle flow", actorId: "user.aiden" });
    expect(automation?.author).toBe("automation");
    expect(automation?.text).toContain('Doing "Run a Flow" for the Flow "Kettle price checker".');
    expect(automation?.text).toContain("I read flow as flowId.");
    expect(automation?.ask).toBeNull();
  });

  it("asks in the thread before a delete, carrying exactly what it would run", async () => {
    const { say, turns } = await thread(scripted('{"do": "flow.delete", "with": {"flowId": "toaster"}}'));
    const answer = await say("get rid of the toaster flow");

    expect(answer.response).toMatchObject({ runNow: false, decision: { kind: "invoke", invocation: { asksFirst: true } } });
    const confirmation = (await turns())[1];
    expect(confirmation?.ask).toMatchObject({ askId: answer.response?.askId, kind: "confirm", status: "pending", parks: false, consequences: ["delete"], control: { name: "Delete a Flow", kind: "panel action" } });
    expect(confirmation?.text).toContain("delete or remove something");
    expect(confirmation?.attachment?.kind).toBe(AUTOMATION_STUDIO_PANEL_CAPABILITY_ATTACHMENT);
    // Identifier-shaped, so the panel's contract parser keeps the turn, and it decodes to exactly what would run.
    expect(confirmation?.attachment?.ref).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(JSON.parse(Buffer.from(confirmation?.attachment?.ref ?? "", "base64url").toString("utf8"))).toEqual({ capabilityId: "flow.delete", arguments: { flowId: "flow.toaster-2" } });
  });

  it("answers in plain English when the model fails, and keeps the person's message", async () => {
    const failure = Object.assign(new Error("socket hang up"), { code: "llm.provider_network_error", retryable: true });
    const { say, turns } = await thread(scripted(failure, failure));
    const answer = await say("good morning");

    expect(answer.response).toMatchObject({ source: "closest_match", attempts: 2, runNow: false, decision: { kind: "reply" } });
    const [person, automation] = await turns();
    expect(person?.text).toBe("good morning");
    expect(automation?.text).toContain("I read your message without the model, because the model could not be reached.");
    expect(automation?.text).not.toContain("socket hang up");
  });

  it("still operates the panel with no model connected", async () => {
    const { say, turns } = await thread(null);
    const answer = await say("run the flow called kettle");
    expect(answer.response).toMatchObject({ runNow: true, decision: { kind: "invoke", invocation: { capabilityId: "run.execute", arguments: { flowId: "flow.kettle-1" } } } });
    expect((await turns())[1]?.text).toContain("because no model is connected to the conversation yet");
  });

  it("gives the model the thread so far, with what the panel did marked as the panel", async () => {
    let seen: unknown;
    const model: AutomationStudioConversationModel = {
      name: "recording",
      decide: async (request) => {
        seen = request.transcript;
        return '{"reply": "ok"}';
      }
    };
    const { say, record } = await thread(model);
    await say("hello");
    await record("Started the run.");
    await say("and again");
    expect(seen).toEqual([{ author: "person", text: "hello" }, { author: "automation", text: "ok" }, { author: "panel", text: "Started the run." }]);
  });

  it("hands what reading the turn cost to the command, never to the client", async () => {
    const pricing: AutomationStudioConversationModel = {
      name: "pricing",
      decide: async (_request, execution) => {
        execution.paid?.(0.0003);
        return '{"do": "run.execute", "with": {"flow": "kettle"}}';
      }
    };
    const { say } = await thread(pricing);
    const answer = await say("run my kettle flow");
    expect(answer.interpretationCostUsd).toBe(0.0003);
    expect(answer.response).toMatchObject({ runNow: true });
    expect(answer.response).not.toHaveProperty("costUsd");

    await pool?.closeAll();
    const unpriced = await (await thread(scripted('{"do": "run.execute", "with": {"flow": "kettle"}}'))).say("run my kettle flow");
    expect(unpriced).not.toHaveProperty("interpretationCostUsd");
  });
});
