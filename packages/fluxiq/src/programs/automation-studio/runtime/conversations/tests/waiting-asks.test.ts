// The chat's model is shown the questions waiting in the thread, with their
// ids, so a typed answer can name the one it settles (A10b). Since A10 an
// answer that names none of several waiting asks is refused; without the ids
// the model could never name one, and a typed answer settled nothing. What is
// pinned: with two waiting, a stub model that reads only its context names the
// right ask and the answer settles exactly that one; with one waiting, an
// answer naming none settles it as before; and no id reaches the thread's
// text, not even when the model writes one into its own words (t276).
//
// A real thread and a real `ask.answer`; only the model and the registry port
// are stubs. The stub model chooses from its instructions alone, the way a
// real one must.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
import type { AutomationStudioConversationAskInput } from "../ask.ts";
import { AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK, startAutomationStudioConversationCommand, type AutomationStudioConversationCommandCallResult } from "../commands/index.ts";
import { AutomationStudioConversations } from "../conversations.ts";
import type { AutomationStudioConversationModel, AutomationStudioConversationModelRequest } from "../instructions/index.ts";

let rootDir = "";
let pool: AutomationStudioProjectDatabasePool | undefined;
const PROJECT = "project.library";
const RENEW = "ask.builder_one.renew";
const BRANCH = "ask.builder_two.branch";
const QUICK = { attempts: 1, attemptTimeoutMs: 1_000, deadlineMs: 2_000, backoffMs: 1 };

/**
 * A model that answers from its instructions alone: of the waiting questions
 * listed there, it names the one sharing the most words with the message. It
 * cannot know an id it was not shown.
 */
function readingModel(seen: AutomationStudioConversationModelRequest[], omitAskId = false): AutomationStudioConversationModel {
  return {
    name: "stub-reader",
    async decide(request) {
      seen.push(request);
      const listed = [...request.instructions.matchAll(/^ {2}- \[([^\]]+)\] (.+)$/gmu)].map((match) => ({ askId: match[1]!, line: match[2]!.toLowerCase() }));
      const words = request.message.toLowerCase().split(/[^a-z]+/u).filter((word) => word.length > 3);
      const scored = listed.map((entry) => ({ ...entry, score: words.filter((word) => entry.line.includes(word)).length }));
      const best = scored.sort((left, right) => right.score - left.score)[0];
      return { do: "ask.answer", with: { answer: request.message, ...(best && !omitAskId ? { askId: best.askId } : {}) } };
    }
  };
}

async function library(model: AutomationStudioConversationModel) {
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const conversations = new AutomationStudioConversations(pool).bindModel(model);
  const { conversationId } = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null });
  const settled: Array<Record<string, unknown>> = [];
  const port = {
    async call(endpoint: string, payload: Record<string, unknown>): Promise<AutomationStudioConversationCommandCallResult> {
      if (endpoint !== "answer-ask") return { ok: false, error: `No stub for ${endpoint}.` };
      settled.push(payload);
      const ask = await conversations.answerAsk({ projectId: PROJECT, askId: String(payload.askId), kind: payload.kind as "grant" | "deny" | "choice", ...(typeof payload.value === "string" ? { value: payload.value } : {}) });
      return { ok: true, payload: { ask } };
    }
  };
  const ask = (text: string, input: AutomationStudioConversationAskInput) => conversations.appendAutomationTurn({ projectId: PROJECT, conversationId, text, attachment: null, ask: input });
  /** The person types `text`; the model reads it and Core runs what it chose, as the append-turn handler does. */
  const say = async (text: string) => {
    const answer = await conversations.respondToPersonTurn({
      projectId: PROJECT, conversationId, text, actorId: "user.reader",
      capabilities: [AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK.capability], flows: [], onScreen: {}, limits: QUICK
    });
    const context = { port, host: conversations, projectId: PROJECT, conversationId, sessionId: "session.reader", keyLocked: false, paired: false, startLocation: null };
    return { answer, execution: await startAutomationStudioConversationCommand({ response: answer.response, context }) };
  };
  const status = async (askId: string) => (await conversations.getAsk({ projectId: PROJECT, askId }))?.status;
  const threadText = async () => ((await conversations.getConversation({ projectId: PROJECT, conversationId }))?.turns ?? []).map((turn) => turn.text).join("\n");
  return { conversations, ask, say, status, threadText, settled };
}

const renewal: AutomationStudioConversationAskInput = {
  askId: RENEW, kind: "confirm", parks: true, consequences: [], control: { name: "Renew", kind: "button" }
};
const branch: AutomationStudioConversationAskInput = {
  askId: BRANCH, kind: "choice", parks: true, consequences: [], control: null,
  options: [{ id: "opt.north", label: "North branch", route: null }, { id: "opt.harbour", label: "Harbour branch", route: null }]
};

describe("the chat's model names the waiting question an answer settles (A10b)", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-waiting-asks-test-"));
  });

  afterEach(async () => {
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("with two questions waiting, the model is shown both ids and the answer settles the one it names", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const chat = await library(readingModel(seen));
    await chat.ask("Shall I renew the borrowed atlas?", renewal);
    await chat.ask("Which branch should I collect it from?", branch);

    const choosing = await chat.say("the Harbour one, please");
    expect(seen[0]!.instructions).toContain(`  - [${RENEW}] "Shall I renew the borrowed atlas?" (a yes-or-no question about Renew)`);
    expect(seen[0]!.instructions).toContain(`  - [${BRANCH}] "Which branch should I collect it from?" (a choice between "North branch", "Harbour branch")`);
    expect(seen[0]!.instructions).toContain("put the id of the question it answers in askId. With more than one waiting, an answer without askId settles nothing.");
    expect(choosing.execution).toMatchObject({ capabilityId: "ask.answer", status: "done", summary: 'Chose "Harbour branch".' });
    expect(chat.settled).toEqual([{ projectId: PROJECT, askId: BRANCH, kind: "choice", value: "opt.harbour" }]);
    // The older question, the other builder's, is untouched.
    expect([await chat.status(RENEW), await chat.status(BRANCH)]).toEqual(["pending", "answered"]);

    // The one left is the only one shown, and the next answer settles it.
    const renewing = await chat.say("yes, renew the atlas");
    expect(seen[1]!.instructions).toContain(`  - [${RENEW}]`);
    expect(seen[1]!.instructions).not.toContain(BRANCH);
    expect(renewing.execution).toMatchObject({ status: "done", summary: "Answered yes." });
    expect(chat.settled[1]).toEqual({ projectId: PROJECT, askId: RENEW, kind: "grant" });

    // Nothing waits now, and the model is told of no questions.
    await chat.say("thanks");
    expect(seen[2]!.instructions).not.toContain("still waiting for the person's answer");

    // The person never read an id: not in their questions, not in Core's answers.
    const text = await chat.threadText();
    expect(text).not.toContain(RENEW);
    expect(text).not.toContain(BRANCH);
    expect(text).not.toMatch(/ask\.builder/u);
  });

  it("with one question waiting, an answer that names none settles it, as before", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const chat = await library(readingModel(seen, true));
    await chat.ask("Shall I renew the borrowed atlas?", renewal);

    const said = await chat.say("yes, go ahead");
    expect(seen[0]!.instructions).toContain("One question FluxIQ asked in this conversation is still waiting");
    expect(seen[0]!.instructions).not.toContain("an answer without askId settles nothing");
    expect(said.execution).toMatchObject({ status: "done", summary: "Answered yes." });
    expect(chat.settled).toEqual([{ projectId: PROJECT, askId: RENEW, kind: "grant" }]);
    expect(await chat.threadText()).not.toContain(RENEW);
  });

  it("with two waiting and the model naming neither, the answer still settles nothing (A10 unchanged)", async () => {
    const chat = await library(readingModel([], true));
    await chat.ask("Shall I renew the borrowed atlas?", renewal);
    await chat.ask("Which branch should I collect it from?", branch);

    const said = await chat.say("yes, go ahead");
    expect(said.execution).toMatchObject({ status: "failed", error: "more than one question is waiting in this conversation and the answer did not say which" });
    expect(chat.settled).toEqual([]);
    expect([await chat.status(RENEW), await chat.status(BRANCH)]).toEqual(["pending", "pending"]);
    expect(await chat.threadText()).not.toMatch(/ask\.builder/u);
  });

  it("takes an id the model wrote into its own words out of the thread, putting the question's words in its place", async () => {
    const leaky: AutomationStudioConversationModel = { name: "leaky", decide: async () => ({ ask: `Do you mean ${RENEW} or ${BRANCH}?` }) };
    const chat = await library(leaky);
    await chat.ask("Shall I renew the borrowed atlas?", renewal);
    await chat.ask("Which branch should I collect it from?", branch);

    await chat.say("yes");
    const text = await chat.threadText();
    expect(text).toContain('Do you mean "Shall I renew the borrowed atlas?" or "Which branch should I collect it from?"?');
    expect(text).not.toMatch(/ask\.builder/u);
  });
});
