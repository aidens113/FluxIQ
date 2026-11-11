// @fluxiq-test-group real-sql
// Renaming, deleting and starting a new thread, against a real project
// database: a rename names the thread and moves nothing else, a delete takes
// the thread, every turn and ask in it and the records that kept their words in
// one transaction, and nothing still using the thread lets it go.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../framework/persistence/automation/index.ts";
import { automationStudioConversationCommandWork } from "../commands/index.ts";
import { AutomationStudioConversations } from "../conversations.ts";

const PROJECT = "project.thread-changes";
const SAID = "Renew the three loans that are due on Friday.";

let rootDir = "";
let pool: AutomationStudioProjectDatabasePool | undefined;

describe("changing a thread", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-thread-changes-"));
  });

  afterEach(async () => {
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("renames a thread, trimmed, with a new revision and its place in the list kept", async () => {
    const conversations = openConversations();
    const thread = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: "First" });
    const renamed = await conversations.renameConversation({ projectId: PROJECT, conversationId: thread.conversationId, title: "  Weekly loans  " });
    expect(renamed).toMatchObject({ conversationId: thread.conversationId, projectId: PROJECT, title: "Weekly loans", revision: thread.revision + 1, updatedAt: thread.updatedAt });
    expect((await conversations.getConversation({ projectId: PROJECT, conversationId: thread.conversationId }))?.conversation).toEqual(renamed);
  });

  it("refuses a name that says nothing or is too long, and a thread the project does not hold, by code", async () => {
    const conversations = openConversations();
    const thread = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: "First" });
    const rename = (conversationId: string, title: string) => conversations.renameConversation({ projectId: PROJECT, conversationId, title });
    await expect(rename(thread.conversationId, "   ")).rejects.toMatchObject({ diagnostic: { code: "conversation_title_required" } });
    await expect(rename(thread.conversationId, "x".repeat(201))).rejects.toMatchObject({ diagnostic: { code: "conversation_title_too_long" } });
    await expect(rename("conversation.none", "Loans")).rejects.toMatchObject({ diagnostic: { code: "conversation_not_found" }, message: "I could not find that conversation." });
    await expect(conversations.deleteConversation({ projectId: PROJECT, conversationId: "conversation.none" })).rejects.toMatchObject({ diagnostic: { code: "conversation_not_found" } });
    expect((await rename(thread.conversationId, "x".repeat(200))).title).toHaveLength(200);
    // A refused name or an unknown thread wrote nothing.
    expect(await count("select count(*) as count from mutation_records where owner_id = 'conversation.none'")).toBe(0);
  });

  it("deletes the thread, its turns, its asks and the records that kept their words, and nothing of another thread", async () => {
    const conversations = openConversations();
    const thread = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: "Loans" });
    const other = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "flow", id: "flow.other" }, title: "Other" });
    await conversations.appendTurn({ projectId: PROJECT, conversationId: thread.conversationId, text: SAID, actorId: "user.one" });
    const asked = await conversations.appendAutomationTurn({ projectId: PROJECT, conversationId: thread.conversationId, text: "Which branch?", ask: { askId: "ask.branch", kind: "choice", parks: false, options: [{ id: "north", label: "North", route: null }, { id: "south", label: "South", route: null }] }, attachment: null });
    await conversations.answerAsk({ projectId: PROJECT, askId: "ask.branch", kind: "choice", value: "north" });
    await conversations.renameConversation({ projectId: PROJECT, conversationId: thread.conversationId, title: "Friday loans" });
    await conversations.appendTurn({ projectId: PROJECT, conversationId: other.conversationId, text: "Keep me." });
    expect(asked.ask?.askId).toBe("ask.branch");

    expect(await conversations.deleteConversation({ projectId: PROJECT, conversationId: thread.conversationId })).toEqual({ deleted: true, conversationId: thread.conversationId });

    expect(await conversations.getConversation({ projectId: PROJECT, conversationId: thread.conversationId })).toBeNull();
    expect(await conversations.getAsk({ projectId: PROJECT, askId: "ask.branch" })).toBeNull();
    expect(await count("select count(*) as count from conversation_turns where conversation_id = ?", [thread.conversationId])).toBe(0);
    expect(await count("select count(*) as count from conversation_asks where conversation_id = ?", [thread.conversationId])).toBe(0);
    // No record keeps what was said, answered or named, and only the removal's own record names the thread.
    expect(await count("select count(*) as count from mutation_records where response_json like ? or response_json like ? or response_json like ?", [`%${SAID}%`, "%Friday loans%", "%north%"])).toBe(0);
    expect(await count("select count(*) as count from mutation_records where owner_id in (?, 'ask.branch')", [thread.conversationId])).toBe(1);
    expect(await count("select count(*) as count from mutation_touched_entities where mutation_id not in (select mutation_id from mutation_records)")).toBe(0);
    expect(await count("select count(*) as count from change_feed where entity_kind = 'conversation' and entity_id = ? and operation = 'delete'", [thread.conversationId])).toBe(1);
    // The other thread is as it was.
    expect((await conversations.getConversation({ projectId: PROJECT, conversationId: other.conversationId }))?.turns.map((turn) => turn.text)).toEqual(["Keep me."]);
  });

  it("opens a thread under a deleted thread's id as a new, empty one rather than replaying the old", async () => {
    const conversations = openConversations();
    const first = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "run", id: "run.1" }, title: "Run", conversationId: "conversation.fixed" });
    await conversations.appendTurn({ projectId: PROJECT, conversationId: first.conversationId, text: SAID });
    await conversations.deleteConversation({ projectId: PROJECT, conversationId: "conversation.fixed" });
    const again = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "run", id: "run.1" }, title: "Run", conversationId: "conversation.fixed" });
    expect(again.turnCount).toBe(0);
    expect((await conversations.getConversation({ projectId: PROJECT, conversationId: "conversation.fixed" }))?.turns).toEqual([]);
    // And it can be deleted again: each removal is its own mutation.
    await expect(conversations.deleteConversation({ projectId: PROJECT, conversationId: "conversation.fixed" })).resolves.toEqual({ deleted: true, conversationId: "conversation.fixed" });
  });

  it("refuses to delete a thread while a run is parked on one of its asks, and lets it go once that is answered", async () => {
    const conversations = openConversations();
    const thread = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "run", id: "run.parked" }, title: null });
    await conversations.appendAutomationTurn({ projectId: PROJECT, conversationId: thread.conversationId, text: "May I press Renew?", ask: { askId: "ask.parked", kind: "confirm", parks: true }, attachment: null });
    await expect(conversations.deleteConversation({ projectId: PROJECT, conversationId: thread.conversationId })).rejects.toMatchObject({ diagnostic: { code: "conversation_run_active" } });
    expect((await conversations.getConversation({ projectId: PROJECT, conversationId: thread.conversationId }))?.turns).toHaveLength(1);
    await conversations.answerAsk({ projectId: PROJECT, askId: "ask.parked", kind: "deny" });
    await expect(conversations.deleteConversation({ projectId: PROJECT, conversationId: thread.conversationId })).resolves.toMatchObject({ deleted: true });
  });

  it("refuses to delete a thread while work the chat started from it is still running here", async () => {
    const conversations = openConversations();
    const thread = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null });
    let finish: () => void = () => undefined;
    automationStudioConversationCommandWork.track(new Promise<void>((resolve) => { finish = resolve; }), { projectId: PROJECT, conversationId: thread.conversationId });
    await expect(conversations.deleteConversation({ projectId: PROJECT, conversationId: thread.conversationId })).rejects.toMatchObject({ diagnostic: { code: "conversation_run_active" } });
    finish();
    await automationStudioConversationCommandWork.idle();
    await expect(conversations.deleteConversation({ projectId: PROJECT, conversationId: thread.conversationId })).resolves.toMatchObject({ deleted: true });
  });

  it("opens a new thread for the subject when asked for a fresh one, and Core continues the newest", async () => {
    const conversations = openConversations();
    const subject = { kind: "project" as const, id: PROJECT };
    const first = await conversations.openConversation({ projectId: PROJECT, subject, title: null });
    expect((await conversations.openConversation({ projectId: PROJECT, subject, title: null })).conversationId).toBe(first.conversationId);
    // The newest is told by when it was touched, to the millisecond: the fresh one must not share the first's.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const fresh =await conversations.openConversation({ projectId: PROJECT, subject, title: null, fresh: true });
    expect(fresh.conversationId).not.toBe(first.conversationId);
    expect(fresh).toMatchObject({ status: "open", turnCount: 0 });
    expect((await conversations.openConversation({ projectId: PROJECT, subject, title: null })).conversationId).toBe(fresh.conversationId);
    expect((await conversations.listConversations({ projectId: PROJECT })).map((thread) => thread.conversationId).sort()).toEqual([first.conversationId, fresh.conversationId].sort());
  });
});

function openConversations(): AutomationStudioConversations {
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  return new AutomationStudioConversations(pool);
}

async function count(sql: string, values: unknown[] = []): Promise<number> {
  const lease = await pool!.acquire(PROJECT);
  try {
    return (await lease.database.get<{ count: number }>(sql, values))?.count ?? -1;
  } finally {
    await lease.release();
  }
}
