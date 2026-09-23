// What the conversation store has to be true about, proved against a real
// project database rather than a stand-in: a turn appends, the thread reads
// back in the order it was said, `sinceTurnId` returns only what followed, an
// ask is answered once, and every write reaches the project change feed --
// which is the only way a turn ever reaches a reader who is not asking.

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioActionPermissionRequest } from "../../action-permissions/index.ts";
import { AutomationStudioProjectAdministration, AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
import { automationStudioConversationAskIsConsequential, automationStudioConversationAskRoute } from "../ask.ts";
import { AUTOMATION_STUDIO_CONVERSATION_ASK_ANSWERED, AutomationStudioProjectConversationStore } from "../store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-conversation-store-test");
const PROJECT = "project.conversations";
const CONVERSATION = "conversation.first";

const PERMISSION_REQUEST: AutomationStudioActionPermissionRequest = {
  schemaVersion: "automation-studio.action-permission-request.v1",
  requestId: "request.schedule-post",
  requestedAtMs: 1_700_000_000_000,
  action: { kind: "flow_step", id: "node.press", ref: "step.3", verb: "press" },
  control: { name: "Schedule post", kind: "button" },
  consequences: ["send_or_publish", "create_new"],
  missing: ["send_or_publish"],
  reason: { stage: "authoring", instructionIds: ["instruction.post"] },
  authority: { granted: ["create_new"], instructed: [] },
  sentence: 'The Flow its instruction describes would press "Schedule post" (button) each time it runs, which would send or publish something. Neither its instruction nor a grant allows that, so the build stopped to ask.'
};

type Fixture = { pool: AutomationStudioProjectDatabasePool; store: AutomationStudioProjectConversationStore };

let fixture: Fixture | undefined;

describe("AutomationStudioProjectConversationStore", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => {
    if (fixture) {
      await fixture.store.close();
      await fixture.pool.closeAll();
      fixture = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("installs migration 0021's tables, its ordinal index, and the answered-once check", async () => {
    const { pool } = await openFixture();
    const lease = await pool.acquire(PROJECT);
    const tables = await lease.database.all<{ name: string }>("select name from sqlite_master where type = 'table' and name like 'conversation%' order by name");
    expect(tables.map((row) => row.name)).toEqual(["conversation_asks", "conversation_turns", "conversations"]);
    const indexes = await lease.database.all<{ name: string }>("select name from sqlite_master where type = 'index' and name like 'conversation%' order by name");
    expect(indexes.map((row) => row.name)).toEqual(["conversation_asks_conversation_idx", "conversation_asks_pending_idx", "conversation_turns_ordinal_idx", "conversations_subject_idx", "conversations_updated_idx"]);
    await expect(lease.database.get("select migration_id from automation_schema_migrations where migration_id = '0021_conversations'")).resolves.toEqual({ migration_id: "0021_conversations" });
    // The answered-once rule is structural: a status and an answer that disagree cannot be stored at all.
    await expect(
      lease.database.run("insert into conversation_asks (ask_id, conversation_id, turn_id, kind, status, parks, created_at_ms) values ('a', 'c', 't', 'open', 'answered', 0, 1)")
    ).rejects.toThrow();
    await lease.release();
  });

  it("appends turns and reads the thread back in the order they were said", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "run", subjectId: "run.17", title: "Scheduling the post", changedAt: 10 });
    await store.appendTurn({ mutationId: "m.1", conversationId: CONVERSATION, turnId: "turn.1", author: "automation", text: "I am about to schedule the post.", changedAt: 11 });
    await store.appendTurn({ mutationId: "m.2", conversationId: CONVERSATION, turnId: "turn.2", author: "person", text: "Go ahead.", actorId: "user.aiden", changedAt: 12 });
    await store.appendTurn({ mutationId: "m.3", conversationId: CONVERSATION, turnId: "turn.3", author: "automation", text: "Scheduled.", attachment: { kind: "run", ref: "run.17" }, changedAt: 13 });

    const thread = await store.getConversation({ conversationId: CONVERSATION });
    expect(thread?.conversation.subject).toEqual({ kind: "run", id: "run.17" });
    expect(thread?.conversation.projectId).toBe(PROJECT);
    expect(thread?.conversation.turnCount).toBe(3);
    expect(thread?.conversation.revision).toBe(4);
    expect(thread?.hasMore).toBe(false);
    expect(thread?.turns.map((turn) => [turn.ordinal, turn.author, turn.text])).toEqual([
      [1, "automation", "I am about to schedule the post."],
      [2, "person", "Go ahead."],
      [3, "automation", "Scheduled."]
    ]);
    expect(thread?.turns[1]?.actorId).toBe("user.aiden");
    expect(thread?.turns[2]?.attachment).toEqual({ kind: "run", ref: "run.17" });
    expect(thread?.turns[0]?.ask).toBeNull();
  });

  it("reads only what followed sinceTurnId, and refuses a turn it does not hold", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "flow", subjectId: "flow.1", changedAt: 10 });
    for (const ordinal of [1, 2, 3, 4]) {
      await store.appendTurn({ mutationId: `m.${ordinal}`, conversationId: CONVERSATION, turnId: `turn.${ordinal}`, author: "automation", text: `Turn ${ordinal}.`, changedAt: 10 + ordinal });
    }
    const since = await store.getConversation({ conversationId: CONVERSATION, sinceTurnId: "turn.2" });
    expect(since?.turns.map((turn) => turn.turnId)).toEqual(["turn.3", "turn.4"]);
    const last = await store.getConversation({ conversationId: CONVERSATION, sinceTurnId: "turn.4" });
    expect(last?.turns).toEqual([]);
    // Reading an unknown turn id as "from the start" would look exactly like a
    // thread that had been rewritten, so it is refused instead.
    await expect(store.getConversation({ conversationId: CONVERSATION, sinceTurnId: "turn.9" })).rejects.toThrow("Unknown conversation turn: turn.9");
    expect(await store.getConversation({ conversationId: "conversation.absent" })).toBeNull();
  });

  it("pages the thread and says when the limit cut it short", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "project", subjectId: PROJECT, changedAt: 10 });
    for (const ordinal of [1, 2, 3]) {
      await store.appendTurn({ mutationId: `m.${ordinal}`, conversationId: CONVERSATION, turnId: `turn.${ordinal}`, author: "person", text: `Turn ${ordinal}.`, changedAt: 10 + ordinal });
    }
    const page = await store.getConversation({ conversationId: CONVERSATION, limit: 2 });
    expect(page?.turns.map((turn) => turn.turnId)).toEqual(["turn.1", "turn.2"]);
    expect(page?.hasMore).toBe(true);
  });

  it("carries an action-permission request whole, keyed by the request's own requestId", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "build", subjectId: "build.4", changedAt: 10 });
    const turn = await store.appendTurn({
      mutationId: "m.ask",
      conversationId: CONVERSATION,
      turnId: "turn.ask",
      author: "automation",
      text: PERMISSION_REQUEST.sentence,
      ask: { askId: PERMISSION_REQUEST.requestId, kind: "permission", parks: true, missing: PERMISSION_REQUEST.missing, control: PERMISSION_REQUEST.control, permissionRequest: PERMISSION_REQUEST },
      changedAt: 11
    });
    expect(turn.ask?.askId).toBe("request.schedule-post");
    expect(turn.ask?.parks).toBe(true);
    expect(turn.ask?.status).toBe("pending");

    const stored = await store.getAsk("request.schedule-post");
    expect(stored?.permissionRequest).toEqual(PERMISSION_REQUEST);
    expect(stored?.missing).toEqual(["send_or_publish"]);
    expect(stored?.control).toEqual({ name: "Schedule post", kind: "button" });
    const thread = await store.getConversation({ conversationId: CONVERSATION });
    expect(thread?.conversation.pendingAskCount).toBe(1);
    expect(thread?.turns[0]?.ask?.permissionRequest?.sentence).toBe(PERMISSION_REQUEST.sentence);
    // A permission ask that is not keyed by its request is the one thing that would break the join.
    await expect(
      store.appendTurn({ mutationId: "m.bad", conversationId: CONVERSATION, turnId: "turn.bad", author: "automation", text: "?", ask: { askId: "ask.other", kind: "permission", parks: true, permissionRequest: PERMISSION_REQUEST } })
    ).rejects.toThrow("A permission ask is keyed by the request's own requestId.");
  });

  it("answers an ask once, and refuses a second answer that says anything different", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "build", subjectId: "build.4", changedAt: 10 });
    await store.appendTurn({
      mutationId: "m.ask",
      conversationId: CONVERSATION,
      turnId: "turn.ask",
      author: "automation",
      text: PERMISSION_REQUEST.sentence,
      ask: { askId: PERMISSION_REQUEST.requestId, kind: "permission", parks: true, missing: PERMISSION_REQUEST.missing, permissionRequest: PERMISSION_REQUEST },
      changedAt: 11
    });

    const answered = await store.answerAsk({ mutationId: "m.answer", askId: "request.schedule-post", kind: "grant", actorId: "user.aiden", changedAt: 12 });
    expect(answered.status).toBe("answered");
    expect(answered.answer).toEqual({ askId: "request.schedule-post", answeredAt: 12, kind: "grant", value: null, actorId: "user.aiden" });

    await expect(store.answerAsk({ mutationId: "m.answer.again", askId: "request.schedule-post", kind: "deny", changedAt: 13 })).rejects.toThrow(AUTOMATION_STUDIO_CONVERSATION_ASK_ANSWERED);
    const unchanged = await store.getAsk("request.schedule-post");
    expect(unchanged?.answer?.kind).toBe("grant");
    const thread = await store.getConversation({ conversationId: CONVERSATION });
    expect(thread?.conversation.pendingAskCount).toBe(0);
  });

  it("replays an exact resend of the same answer rather than writing it twice", async () => {
    const { store } = await openFixture();
    await seedAsk(store);
    const first = await store.answerAsk({ mutationId: "conversation.answer:request.schedule-post", askId: "request.schedule-post", kind: "grant", changedAt: 12 });
    const resent = await store.answerAsk({ mutationId: "conversation.answer:request.schedule-post", askId: "request.schedule-post", kind: "grant", changedAt: 12 });
    expect(resent).toEqual(first);
    // The same key with a different answer is the second answer the contract refuses.
    await expect(store.answerAsk({ mutationId: "conversation.answer:request.schedule-post", askId: "request.schedule-post", kind: "deny", changedAt: 13 })).rejects.toThrow("different request digest");
  });

  it("refuses an answer that does not settle the question it was asked", async () => {
    const { store } = await openFixture();
    await seedAsk(store);
    await expect(store.answerAsk({ mutationId: "m.text", askId: "request.schedule-post", kind: "text", value: "sure", changedAt: 12 })).rejects.toThrow("A text answer does not settle a permission question.");

    await store.appendTurn({
      mutationId: "m.choice",
      conversationId: CONVERSATION,
      turnId: "turn.choice",
      author: "automation",
      text: "Which listing did you mean?",
      ask: { askId: "ask.listing", kind: "choice", parks: true, options: [{ id: "first", label: "The first one", route: null }, { id: "second", label: "The second one", route: "route.second" }] },
      changedAt: 13
    });
    await expect(store.answerAsk({ mutationId: "m.choice.bad", askId: "ask.listing", kind: "choice", value: "third", changedAt: 14 })).rejects.toThrow("An answer to a choice must name one of its options.");
    const chosen = await store.answerAsk({ mutationId: "m.choice.good", askId: "ask.listing", kind: "choice", value: "second", changedAt: 15 });
    expect(chosen.answer?.value).toBe("second");
  });

  it("carries the routes a parked run resumes down, and reads back the one the answer took", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "run", subjectId: "run.17", changedAt: 10 });
    await store.appendTurn({
      mutationId: "m.approve",
      conversationId: CONVERSATION,
      turnId: "turn.approve",
      author: "automation",
      text: "May I publish this?",
      ask: { askId: "ask.approve", kind: "confirm", parks: true, timeoutMs: 60_000, onTimeout: "default", consequences: ["send_or_publish"], routes: { granted: "route.publish", denied: "route.hold", timedOut: "route.hold" } },
      changedAt: 11
    });
    const pending = await store.getAsk("ask.approve");
    expect(pending?.routes).toEqual({ granted: "route.publish", denied: "route.hold", timedOut: "route.hold" });
    expect(pending?.consequences).toEqual(["send_or_publish"]);
    // Nothing is settled, so no branch is taken yet.
    expect(pending && automationStudioConversationAskRoute(pending)).toBeNull();

    const denied = await store.answerAsk({ mutationId: "m.deny", askId: "ask.approve", kind: "deny", changedAt: 12 });
    expect(automationStudioConversationAskRoute(denied)).toBe("route.hold");
  });

  it("lets one option of a choice name its own branch, overriding the ask's granted route", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "flow", subjectId: "flow.1", changedAt: 10 });
    await store.appendTurn({
      mutationId: "m.choice",
      conversationId: CONVERSATION,
      turnId: "turn.choice",
      author: "automation",
      text: "Which listing did you mean?",
      ask: { askId: "ask.listing", kind: "choice", parks: true, routes: { granted: "route.default", denied: null, timedOut: null }, options: [{ id: "first", label: "The first one", route: null }, { id: "second", label: "The second one", route: "route.second" }] },
      changedAt: 11
    });
    const chosen = await store.answerAsk({ mutationId: "m.second", askId: "ask.listing", kind: "choice", value: "second", changedAt: 12 });
    expect(chosen.options?.map((option) => [option.id, option.route])).toEqual([["first", null], ["second", "route.second"]]);
    expect(automationStudioConversationAskRoute(chosen)).toBe("route.second");
  });

  it("says which asks may be answered in passing and which need the whole question", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "build", subjectId: "build.4", changedAt: 10 });
    await store.appendTurn({ mutationId: "m.p", conversationId: CONVERSATION, turnId: "turn.p", author: "automation", text: PERMISSION_REQUEST.sentence, ask: { askId: PERMISSION_REQUEST.requestId, kind: "permission", parks: true, consequences: PERMISSION_REQUEST.consequences, missing: PERMISSION_REQUEST.missing, permissionRequest: PERMISSION_REQUEST }, changedAt: 11 });
    await store.appendTurn({ mutationId: "m.mild", conversationId: CONVERSATION, turnId: "turn.mild", author: "automation", text: "Shall I save this draft?", ask: { askId: "ask.mild", kind: "confirm", parks: false, consequences: ["create_new"] }, changedAt: 12 });
    await store.appendTurn({ mutationId: "m.open2", conversationId: CONVERSATION, turnId: "turn.open2", author: "automation", text: "Anything else?", ask: { askId: "ask.open", kind: "open", parks: false }, changedAt: 13 });

    const permission = await store.getAsk(PERMISSION_REQUEST.requestId);
    // What it was refused is send_or_publish, which reaches other people.
    expect(permission && automationStudioConversationAskIsConsequential(permission)).toBe(true);
    const mild = await store.getAsk("ask.mild");
    expect(mild && automationStudioConversationAskIsConsequential(mild)).toBe(false);
    const openAsk = await store.getAsk("ask.open");
    expect(openAsk && automationStudioConversationAskIsConsequential(openAsk)).toBe(false);
  });

  it("reads one turn back on its own, which is how an attachment is resolved", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "run", subjectId: "run.17", changedAt: 10 });
    await store.appendTurn({ mutationId: "m.1", conversationId: CONVERSATION, turnId: "turn.1", author: "automation", text: "Here is the diff.", attachment: { kind: "graph-diff", ref: "adaptation.7" }, changedAt: 11 });
    const turn = await store.getTurn(CONVERSATION, "turn.1");
    expect(turn?.attachment).toEqual({ kind: "graph-diff", ref: "adaptation.7" });
    expect(await store.getTurn(CONVERSATION, "turn.absent")).toBeNull();
  });

  it("records the thread, every turn and every answer on the project change feed", async () => {
    const { pool, store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "run", subjectId: "run.17", changedAt: 10 });
    await store.appendTurn({ mutationId: "m.1", conversationId: CONVERSATION, turnId: "turn.1", author: "automation", text: "May I?", ask: { askId: "ask.1", kind: "confirm", parks: true }, changedAt: 11 });
    await store.answerAsk({ mutationId: "m.answer", askId: "ask.1", kind: "grant", changedAt: 12 });

    const administration = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
    const feed = await administration.changeFeed.listAfter(0);
    expect(feed.map((entry) => [entry.entityKind, entry.entityId, entry.operation])).toEqual([
      ["conversation", CONVERSATION, "create"],
      ["conversation_turn", "turn.1", "create"],
      ["conversation", CONVERSATION, "update"],
      ["conversation_ask", "ask.1", "update"],
      ["conversation", CONVERSATION, "update"]
    ]);
    // The thing that changed is on the feed before the thread's own revision,
    // so a reader following the feed in order never learns the thread moved
    // before it can see what moved it.
    expect(feed.map((entry) => entry.revision)).toEqual([1, 1, 2, 3, 3]);
    await administration.close();
  });

  it("lists a project's threads, most recently touched first, narrowed by subject and status", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.a", conversationId: "conversation.a", subjectKind: "run", subjectId: "run.1", changedAt: 10 });
    await store.openConversation({ mutationId: "m.b", conversationId: "conversation.b", subjectKind: "flow", subjectId: "flow.1", changedAt: 20 });
    await store.appendTurn({ mutationId: "m.a.1", conversationId: "conversation.a", turnId: "turn.a", author: "person", text: "Later.", changedAt: 30 });

    expect((await store.listConversations()).map((conversation) => conversation.conversationId)).toEqual(["conversation.a", "conversation.b"]);
    expect((await store.listConversations({ subjectKind: "flow", subjectId: "flow.1" })).map((conversation) => conversation.conversationId)).toEqual(["conversation.b"]);
    expect(await store.listConversations({ status: "resolved" })).toEqual([]);
  });

  it("refuses a turn with nothing in it, one past the text limit, and one on a thread it does not hold", async () => {
    const { store } = await openFixture();
    await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "project", subjectId: PROJECT, changedAt: 10 });
    await expect(store.appendTurn({ mutationId: "m.empty", conversationId: CONVERSATION, turnId: "turn.empty", author: "person", text: "   " })).rejects.toThrow("A conversation turn must say something.");
    await expect(store.appendTurn({ mutationId: "m.long", conversationId: CONVERSATION, turnId: "turn.long", author: "person", text: "x".repeat(16_001) })).rejects.toThrow("at most 16000 characters");
    await expect(store.appendTurn({ mutationId: "m.absent", conversationId: "conversation.absent", turnId: "turn.absent", author: "person", text: "Hello." })).rejects.toThrow("Unknown conversation: conversation.absent");
  });
});

async function seedAsk(store: AutomationStudioProjectConversationStore): Promise<void> {
  await store.openConversation({ mutationId: "m.open", conversationId: CONVERSATION, subjectKind: "build", subjectId: "build.4", changedAt: 10 });
  await store.appendTurn({
    mutationId: "m.ask",
    conversationId: CONVERSATION,
    turnId: "turn.ask",
    author: "automation",
    text: PERMISSION_REQUEST.sentence,
    ask: { askId: PERMISSION_REQUEST.requestId, kind: "permission", parks: true, missing: PERMISSION_REQUEST.missing, permissionRequest: PERMISSION_REQUEST },
    changedAt: 11
  });
}

async function openFixture(): Promise<Fixture> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const store = await AutomationStudioProjectConversationStore.open({ pool, projectId: PROJECT });
  fixture = { pool, store };
  return fixture;
}
