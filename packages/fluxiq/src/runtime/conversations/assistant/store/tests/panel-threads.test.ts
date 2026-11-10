// @fluxiq-test-group real-sql
// Panel threads in their reserved per-person database: subject `panel`, the
// same rows as a project's thread, one person's threads out of another's
// reach, a waiting call taken once, and a rebuild that keeps every column a
// project's `conversations` table has.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../../framework/persistence/automation/index.ts";
import { AutomationStudioProjectConversationStore } from "../../../store.ts";
import { panelAssistantDatabaseId } from "../database-id.ts";
import { PANEL_ASSISTANT_STORE_MIGRATIONS } from "../migrations.ts";
import { PanelAssistantThreads } from "../panel-threads.ts";

let rootDir = "";
let threads: PanelAssistantThreads;

describe("PanelAssistantThreads", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-panel-threads-"));
    threads = new PanelAssistantThreads({ rootDir });
  });

  afterEach(async () => {
    await threads.close();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("stores a panel thread with the project's rows and reads it back as subject panel", async () => {
    const opened = await threads.open("user.ada", { title: "Tidy my Flows" });
    expect(opened.subject).toEqual({ kind: "panel", id: "panel" });
    expect(opened.projectId).toBe("panel");
    await threads.append("user.ada", { conversationId: opened.conversationId, author: "person", text: "rename step 2", actorId: "user.ada" });
    await threads.append("user.ada", { conversationId: opened.conversationId, author: "automation", text: "**Renaming a step**. Done." });
    const thread = await threads.read("user.ada", { conversationId: opened.conversationId });
    expect(thread?.conversation.turnCount).toBe(2);
    expect(thread?.turns.map((turn) => [turn.author, turn.text])).toEqual([["person", "rename step 2"], ["automation", "**Renaming a step**. Done."]]);
    expect((await threads.list("user.ada")).map((conversation) => conversation.conversationId)).toEqual([opened.conversationId]);
  });

  it("keeps each person's threads in their own database", async () => {
    const own = await threads.open("user.ada", {});
    expect(await threads.read("user.grace", { conversationId: own.conversationId })).toBeNull();
    expect(await threads.list("user.grace")).toEqual([]);
    expect(panelAssistantDatabaseId("user.ada")).not.toBe(panelAssistantDatabaseId("user.grace"));
    expect(panelAssistantDatabaseId("user.ada")).toMatch(/^person-[0-9a-f]{40}$/u);
  });

  it("keeps a card's call and lets one press take it, once", async () => {
    const opened = await threads.open("user.ada", {});
    await threads.appendCard("user.ada", { conversationId: opened.conversationId, text: "Delete the Flow “Old search”?", ask: { askId: "ask.one", kind: "confirm", parks: false }, call: { toolName: "automation-studio__delete-flow", input: { projectId: "p", flowId: "f" }, words: "delete this", context: { projectId: "p", flowId: "f" } } });
    const ask = await threads.getAsk("user.ada", "ask.one");
    expect(ask?.kind).toBe("confirm");
    const [first, second] = await Promise.all([threads.takeWaitingCall("user.ada", "ask.one"), threads.takeWaitingCall("user.ada", "ask.one")]);
    expect([first, second].filter((taken) => taken !== null)).toEqual([{ askId: "ask.one", conversationId: opened.conversationId, toolName: "automation-studio__delete-flow", input: { projectId: "p", flowId: "f" }, words: "delete this", context: { projectId: "p", flowId: "f" } }]);
    expect(await threads.takeWaitingCall("user.ada", "ask.missing")).toBeNull();
  });

  it("rebuilds conversations with every column a project database has, and only there allows panel", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    try {
      const project = await AutomationStudioProjectConversationStore.open({ pool, projectId: "project.plain" });
      await expect(project.openConversation({ mutationId: "m.1", conversationId: "c.1", subjectKind: "panel", subjectId: "panel" })).rejects.toThrow(/CHECK constraint/u);
      await project.close();
      const reserved = await AutomationStudioProjectConversationStore.openReserved({ pool, databaseId: "person-test", migrations: PANEL_ASSISTANT_STORE_MIGRATIONS });
      await reserved.close();
      const columns = async (databaseId: string): Promise<unknown[]> => {
        const lease = await pool.acquire(databaseId);
        try {
          return await lease.database.all("select name, type, \"notnull\", dflt_value, pk from pragma_table_info('conversations') order by cid");
        } finally {
          await lease.release();
        }
      };
      expect(await columns("person-test")).toEqual(await columns("project.plain"));
    } finally {
      await pool.closeAll();
    }
  });
});
