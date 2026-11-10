// @fluxiq-test-group real-sql
// A chat turn whose exact words are a task with a saved Flow (task speed S6), in a real thread. Pinned:
// those words start the task with no model call at all, and any other message -- another request, a
// paraphrase, the same words while an ask waits -- is still read by the model.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../framework/persistence/automation/index.ts";
import { parseAutomationStudioPanelCapabilities } from "../../../../framework/automation-service/panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../../commands/index.ts";
import { AutomationStudioConversations } from "../../conversations.ts";
import type { AutomationStudioConversationModel } from "../index.ts";

const PROJECT = "project.home";
const WORDS = "Save every dining table under $200 to my saved list.";
const FLOWS = [{ flowId: "flow.kettle-1", name: "Kettle price checker" }];
const CAPABILITIES = [
  ...parseAutomationStudioPanelCapabilities([{ id: "run.execute", title: "Run a Flow", summary: "Run the Flow now.", phrases: ["run the flow"], consequences: ["create_new"], arguments: [{ name: "projectId", required: true }, { name: "flowId", required: true }] }]),
  AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability
];
const QUICK = { attempts: 1, attemptTimeoutMs: 1_000, deadlineMs: 2_000, backoffMs: 1 };

let rootDir = "";
let pool: AutomationStudioProjectDatabasePool | undefined;

/** A model that answers each call from the script and counts every call it is asked. */
function counted(...answers: string[]) {
  const asked: string[] = [];
  const model: AutomationStudioConversationModel = {
    name: "counted",
    decide: async (request) => {
      asked.push(request.message);
      return answers.shift();
    }
  };
  return { asked, model };
}

async function thread(model: AutomationStudioConversationModel) {
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const conversations = new AutomationStudioConversations(pool).bindModel(model);
  const opened = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null });
  const looked: string[] = [];
  const say = (text: string) => conversations.respondToPersonTurn({
    projectId: PROJECT, conversationId: opened.conversationId, text, actorId: "user.aiden",
    capabilities: CAPABILITIES, flows: FLOWS, onScreen: { pageUrl: "http://127.0.0.1:4100/classifieds" }, limits: QUICK,
    knownTask: async (words) => {
      looked.push(words);
      return words === WORDS;
    }
  });
  return { say, looked };
}

describe("a known task's words in the chat", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-known-task-turn-test-"));
  });

  afterEach(async () => {
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("start the task and ask the model nothing", async () => {
    const { asked, model } = counted();
    const { say, looked } = await thread(model);
    const answer = await say(WORDS);
    expect(asked).toEqual([]);
    expect(looked).toEqual([WORDS]);
    expect(answer.interpretationCostUsd).toBeUndefined();
    expect(answer.response).toMatchObject({ source: "known_task", attempts: 0, modelProblem: null, runNow: true, decision: { kind: "invoke", invocation: { capabilityId: "flow.createHere", arguments: { instruction: WORDS } } } });
  });

  it("never swallow a message asking for something else", async () => {
    const { asked, model } = counted('{"do": "run.execute", "with": {"flow": "kettle"}}');
    const { say } = await thread(model);
    const answer = await say("run my kettle flow");
    expect(asked).toEqual(["run my kettle flow"]);
    expect(answer.response).toMatchObject({ source: "model", decision: { kind: "invoke", invocation: { capabilityId: "run.execute", arguments: { flowId: "flow.kettle-1" } } } });
  });

  it("leave a paraphrase of the task to the model", async () => {
    const paraphrase = "save the dining tables that cost less than 200 dollars";
    const { asked, model } = counted(`{"do": "flow.createHere", "with": {"instruction": "${paraphrase}"}}`);
    const { say } = await thread(model);
    const answer = await say(paraphrase);
    expect(asked).toEqual([paraphrase]);
    expect(answer.response?.source).toBe("model");
  });
});
