// The collaborator the service exposes, and the writer Core itself speaks
// through. The point of the writer is that code with something to say does not
// have to carry a conversation id: it names its subject once, and the thread
// is opened on the first thing it says and reused for the rest.

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioActionPermissionRequest } from "../../action-permissions/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
import { AutomationStudioConversations } from "../conversations.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-conversations-test");
const PROJECT = "project.conversations";

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

let pool: AutomationStudioProjectDatabasePool | undefined;

describe("AutomationStudioConversations", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => {
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("opens the subject's thread on the first thing said, and keeps it for the rest", async () => {
    const conversations = openConversations();
    const writer = conversations.writerFor({ projectId: PROJECT, subject: { kind: "run", id: "run.17" }, title: "Scheduling the post" });
    const first = await writer.say("I am about to schedule the post.");
    const second = await writer.say("Still working.", { kind: "run", ref: "run.17" });

    expect(second.conversationId).toBe(first.conversationId);
    expect(await writer.conversationId()).toBe(first.conversationId);
    expect(first.author).toBe("automation");
    expect(second.attachment).toEqual({ kind: "run", ref: "run.17" });

    const threads = await conversations.listConversations({ projectId: PROJECT });
    expect(threads).toHaveLength(1);
    expect(threads[0]?.subject).toEqual({ kind: "run", id: "run.17" });
    expect(threads[0]?.title).toBe("Scheduling the post");
    expect(threads[0]?.turnCount).toBe(2);
  });

  it("continues the subject's own open thread, so one run is not shown as several conversations", async () => {
    const conversations = openConversations();
    // Two call sites inside one run: the executor saying what it is doing, and
    // the permission gate raising its request. Neither holds a conversation id.
    const fromExecutor = conversations.writerFor({ projectId: PROJECT, subject: { kind: "run", id: "run.17" } });
    const fromGate = conversations.writerFor({ projectId: PROJECT, subject: { kind: "run", id: "run.17" } });
    const said = await fromExecutor.say("Opening the scheduler.");
    const asked = await fromGate.askPermission(PERMISSION_REQUEST);

    expect(asked.conversationId).toBe(said.conversationId);
    expect(await conversations.listConversations({ projectId: PROJECT })).toHaveLength(1);
    const thread = await conversations.getConversation({ projectId: PROJECT, conversationId: said.conversationId });
    expect(thread?.turns.map((turn) => turn.ordinal)).toEqual([1, 2]);

    // A different subject is a different thread.
    await conversations.writerFor({ projectId: PROJECT, subject: { kind: "run", id: "run.18" } }).say("A different run.");
    expect(await conversations.listConversations({ projectId: PROJECT })).toHaveLength(2);
  });

  it("raises a permission request as an ask keyed by the request's requestId, and answers it once", async () => {
    const conversations = openConversations();
    const writer = conversations.writerFor({ projectId: PROJECT, subject: { kind: "build", id: "build.4" } });
    const turn = await writer.askPermission(PERMISSION_REQUEST);

    expect(turn.text).toBe(PERMISSION_REQUEST.sentence);
    expect(turn.ask?.askId).toBe(PERMISSION_REQUEST.requestId);
    expect(turn.ask?.kind).toBe("permission");
    // A question that ends the run is what this replaces, so it parks by default.
    expect(turn.ask?.parks).toBe(true);
    expect(turn.ask?.missing).toEqual(["send_or_publish"]);
    expect(turn.ask?.permissionRequest).toEqual(PERMISSION_REQUEST);

    const granted = await conversations.answerAsk({ projectId: PROJECT, askId: PERMISSION_REQUEST.requestId, kind: "grant", actorId: "user.aiden" });
    expect(granted.status).toBe("answered");
    expect(granted.answer?.kind).toBe("grant");
    expect(granted.answer?.actorId).toBe("user.aiden");

    await expect(conversations.answerAsk({ projectId: PROJECT, askId: PERMISSION_REQUEST.requestId, kind: "deny" })).rejects.toThrow("already been answered");
    const thread = await conversations.getConversation({ projectId: PROJECT, conversationId: turn.conversationId });
    expect(thread?.conversation.pendingAskCount).toBe(0);
    expect(thread?.turns[0]?.ask?.answer?.kind).toBe("grant");
  });

  it("takes a person's own turn, and reads back only what followed the turn they have", async () => {
    const conversations = openConversations();
    const writer = conversations.writerFor({ projectId: PROJECT, subject: { kind: "flow", id: "flow.1" } });
    const opening = await writer.say("What should I do about the second listing?");
    const conversationId = opening.conversationId;
    const reply = await conversations.appendTurn({ projectId: PROJECT, conversationId, text: "Skip it.", actorId: "user.aiden" });
    expect(reply.author).toBe("person");
    expect(reply.actorId).toBe("user.aiden");

    const since = await conversations.getConversation({ projectId: PROJECT, conversationId, sinceTurnId: opening.turnId });
    expect(since?.turns.map((turn) => turn.text)).toEqual(["Skip it."]);
    expect(await conversations.getConversation({ projectId: PROJECT, conversationId: "conversation.absent" })).toBeNull();
  });

  it("narrows a listing to one subject, and offers a choice the person settles by naming an option", async () => {
    const conversations = openConversations();
    const runWriter = conversations.writerFor({ projectId: PROJECT, subject: { kind: "run", id: "run.17" } });
    await runWriter.say("Run talk.");
    const flowWriter = conversations.writerFor({ projectId: PROJECT, subject: { kind: "flow", id: "flow.1" } });
    const asked = await flowWriter.ask({
      text: "Which listing did you mean?",
      ask: { askId: "ask.listing", kind: "choice", parks: true, options: [{ id: "first", label: "The first one", route: null }, { id: "second", label: "The second one", route: "route.second" }] }
    });

    const forFlow = await conversations.listConversations({ projectId: PROJECT, subject: { kind: "flow", id: "flow.1" } });
    expect(forFlow.map((conversation) => conversation.conversationId)).toEqual([asked.conversationId]);
    expect((await conversations.listConversations({ projectId: PROJECT })).length).toBe(2);

    const chosen = await conversations.answerAsk({ projectId: PROJECT, askId: "ask.listing", kind: "choice", value: "second" });
    expect(chosen.answer?.value).toBe("second");
    expect((await conversations.getAsk({ projectId: PROJECT, askId: "ask.listing" }))?.status).toBe("answered");
  });

  it("serves a turn's attachment through the configured resolver, and says so when none is configured", async () => {
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const unresolved = new AutomationStudioConversations(pool);
    const writer = unresolved.writerFor({ projectId: PROJECT, subject: { kind: "run", id: "run.17" } });
    const shown = await writer.say("Here is the diff.", { kind: "graph-diff", ref: "adaptation.7" });
    const plain = await writer.say("And nothing to show here.");

    // A turn that shows nothing answers null; a turn that shows something this
    // deployment cannot fetch must not answer the same way.
    expect(await unresolved.getAttachment({ projectId: PROJECT, conversationId: plain.conversationId, turnId: plain.turnId })).toBeNull();
    await expect(unresolved.getAttachment({ projectId: PROJECT, conversationId: shown.conversationId, turnId: shown.turnId })).rejects.toThrow("cannot serve a conversation attachment of kind graph-diff");

    const resolved = new AutomationStudioConversations(pool, async (input) => ({ seen: input.attachment.ref }));
    expect(await resolved.getAttachment({ projectId: PROJECT, conversationId: shown.conversationId, turnId: shown.turnId })).toEqual({
      attachment: { kind: "graph-diff", ref: "adaptation.7" },
      payload: { seen: "adaptation.7" }
    });
    expect(await resolved.getAttachment({ projectId: PROJECT, conversationId: shown.conversationId, turnId: "turn.absent" })).toBeNull();
  });

  it("says so rather than pretending, when the host has no project storage", async () => {
    const conversations = new AutomationStudioConversations(undefined);
    expect(conversations.available).toBe(false);
    await expect(conversations.listConversations({ projectId: PROJECT })).rejects.toThrow("Conversations require project storage.");
    await expect(conversations.writerFor({ projectId: PROJECT, subject: { kind: "run", id: "run.17" } }).say("Hello.")).rejects.toThrow("Conversations require project storage.");
  });
});

function openConversations(): AutomationStudioConversations {
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  return new AutomationStudioConversations(pool);
}
