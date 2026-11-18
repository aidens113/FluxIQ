// @fluxiq-test-group real-sql
// Every committed write to a thread is signalled, once, with its project and
// thread and nothing it said; a read, or a write the store refused, signals
// nothing. A person's panel thread is signalled under their own user id. This
// is what lets the panel hear a turn a run wrote without reading on a timer.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../framework/persistence/automation/index.ts";
import { PanelAssistantThreads } from "../assistant/store/index.ts";
import { AutomationStudioConversations } from "../conversations.ts";
import { AutomationStudioConversationSignalHub, type AutomationStudioConversationSignal } from "../signals/index.ts";

const PROJECT = "project.signals";

let rootDir = "";
let pool: AutomationStudioProjectDatabasePool | undefined;

describe("conversation signals", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-conversation-signals-"));
  });

  afterEach(async () => {
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("signals each write to a project's thread once it has committed, and nothing for a read or a refusal", async () => {
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const conversations = new AutomationStudioConversations(pool);
    const heard: AutomationStudioConversationSignal[] = [];
    conversations.signals.subscribe((signal) => heard.push(signal));
    const subject = { kind: "project" as const, id: PROJECT };
    const thread = await conversations.openConversation({ projectId: PROJECT, subject, title: null });
    // Continuing the subject's open thread writes nothing, and says nothing.
    await conversations.openConversation({ projectId: PROJECT, subject, title: null });
    await conversations.appendTurn({ projectId: PROJECT, conversationId: thread.conversationId, text: "Renew the loans due Friday.", actorId: "user.one" });
    const asked = await conversations.appendAutomationTurn({ projectId: PROJECT, conversationId: thread.conversationId, text: "Which branch?", ask: { askId: "ask.signals", kind: "choice", parks: false, options: [{ id: "north", label: "North", route: null }, { id: "south", label: "South", route: null }] }, attachment: null });
    expect(asked.ask?.askId).toBe("ask.signals");
    await conversations.answerAsk({ projectId: PROJECT, askId: "ask.signals", kind: "choice", value: "north", actorId: "user.one" });
    await conversations.renameConversation({ projectId: PROJECT, conversationId: thread.conversationId, title: "Loans" });
    await conversations.getConversation({ projectId: PROJECT, conversationId: thread.conversationId });
    await conversations.listConversations({ projectId: PROJECT });
    await expect(conversations.renameConversation({ projectId: PROJECT, conversationId: "conversation.none", title: "Nothing" })).rejects.toBeDefined();
    await conversations.deleteConversation({ projectId: PROJECT, conversationId: thread.conversationId });

    const scope = { kind: "project", projectId: PROJECT };
    expect(heard).toEqual([1, 2, 3, 4, 5, 6].map((version) => ({ scope, conversationId: thread.conversationId, version })));
    expect(JSON.stringify(heard)).not.toMatch(/Renew|branch|Loans|north/u);
  });

  it("signals a person's panel thread under their user id, and nothing for a read", async () => {
    const signals = new AutomationStudioConversationSignalHub();
    const heard: AutomationStudioConversationSignal[] = [];
    signals.subscribe((signal) => heard.push(signal));
    const threads = new PanelAssistantThreads({ rootDir: path.join(rootDir, "panel"), signals });
    try {
      const opened = await threads.open("user.ada", { title: null });
      await threads.append("user.ada", { conversationId: opened.conversationId, author: "person", text: "tidy my Flows", actorId: "user.ada" });
      await threads.read("user.ada", { conversationId: opened.conversationId });
      await threads.list("user.ada");
      await threads.rename("user.ada", { conversationId: opened.conversationId, title: "Tidy" });
      await threads.delete("user.ada", { conversationId: opened.conversationId });
      expect(heard).toEqual([1, 2, 3, 4].map((version) => ({ scope: { kind: "panel", userId: "user.ada" }, conversationId: opened.conversationId, version })));
    } finally {
      await threads.close();
    }
  });
});
