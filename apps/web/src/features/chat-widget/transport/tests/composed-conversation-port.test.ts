// The panel's docked chat (t1095): every new chat belongs to a project. With a project open the dock works in
// it; with none open a first message or New chat starts in the person's own project (Core's first-project),
// which the panel then hears of. The person's earlier chats with no project are listed after the project's,
// named "No project · ...", and still read, continue, answer, rename and delete where they live.

import { describe, expect, it } from "vitest";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { createProgramChatTransport } from "../program-chat-transport";

const OWN = { conversationId: "panel-1", projectId: "panel", status: "open", subject: { kind: "panel" }, title: "Weekly post build" };
const THEIRS = { conversationId: "proj-1", projectId: "p1", status: "open", subject: { kind: "project" }, title: "Planning notes" };
const UNTITLED = { conversationId: "panel-2", projectId: "panel", status: "open", subject: { kind: "panel" }, title: null };
const OK = { ok: true as const, payload: {} };
const OPENED = { ok: true as const, payload: { conversation: { conversationId: "proj-new", projectId: "mine" } } };

function dock(open: { projectId: string; name?: string } | undefined, person: { projectId?: string; fails?: boolean } = {}) {
  const api = fakeProgramApi({
    "list-panel-threads": { ok: true, payload: { conversations: [OWN, UNTITLED] } },
    "list-conversations": { ok: true, payload: { conversations: [THEIRS] } },
    "get-panel-thread": OK, "get-conversation": OK, "send-panel-message": { ok: true, payload: { conversation: OWN } },
    "answer-panel-ask": OK, "answer-ask": OK, "rename-panel-thread": OK, "rename-conversation": OK,
    "delete-panel-thread": OK, "delete-conversation": OK, "open-panel-thread": OK, "append-turn": OK, "open-conversation": OPENED
  });
  const asked: string[] = [];
  const found: string[] = [];
  const transport = createProgramChatTransport(api, {
    projectId: () => open?.projectId,
    personProject: {
      find: async () => {
        asked.push("first-project");
        return person.fails ? { ok: false, code: "no_project", sentence: "FluxIQ could not make a project for this chat." } : { ok: true, value: person.projectId ?? "mine" };
      },
      found: (projectId) => found.push(projectId)
    },
    panel: { onScreen: () => ({ page: "flows" }), openProject: () => open }
  });
  return { api, conversation: transport.conversation, asked, found };
}

type Listed = { value: { conversations: Array<{ conversationId: string; title: string | null }> } };

describe("the dock's list", () => {
  it("lists the open project's chats first, then the person's earlier chats, each saying it has no project", async () => {
    const { api, conversation } = dock({ projectId: "p1", name: "Small project" });
    const listed = await conversation.listAllThreads!({ limit: 25 });
    expect((listed as unknown as Listed).value.conversations.map((record) => [record.conversationId, record.title])).toEqual([
      ["proj-1", "Planning notes"],
      ["panel-1", "No project · Weekly post build"],
      ["panel-2", "No project · Chat"]
    ]);
    expect(api.sentTo("list-conversations")).toEqual([{ projectId: "p1", limit: 25 }]);
    expect(api.sentTo("list-panel-threads")).toEqual([{ limit: 25 }]);
  });

  it("with no project open lists every project's chats, then the earlier ones, and says a failed read", async () => {
    const { api, conversation } = dock(undefined);
    const listed = await conversation.listAllThreads!({ limit: 25 });
    expect((listed as unknown as Listed).value.conversations.map((record) => record.conversationId)).toEqual(["proj-1", "panel-1", "panel-2"]);
    expect(api.sentTo("list-conversations")).toEqual([{ projectId: null, limit: 25 }]);
    api.answer("list-conversations", { ok: false, status: 0, code: "request_failed" });
    expect(await conversation.listAllThreads!({ limit: 25 })).toMatchObject({ ok: false });
  });

  it("reads the latest chat from the project, never from the earlier chats", async () => {
    const { api, conversation } = dock({ projectId: "p1" });
    await conversation.listThreads({ subjectKind: "project", status: "open", limit: 1, projectId: "p1" });
    expect(api.sentTo("list-conversations")).toEqual([{ projectId: "p1", subjectKind: "project", subjectId: "p1", status: "open", limit: 1 }]);
    expect(api.sentTo("list-panel-threads")).toEqual([]);
  });
});

describe("a new chat in the dock", () => {
  it("with a project open, starts in it: a first message and New chat are project conversations", async () => {
    const { api, conversation, asked, found } = dock({ projectId: "p1" });
    await conversation.send({ text: "hello", conversationId: undefined, projectId: "p1" });
    await conversation.newThread!({ title: "Notes" });
    expect(api.sentTo("open-conversation")).toEqual([
      { projectId: "p1", subjectKind: "project", subjectId: "p1" },
      { projectId: "p1", subjectKind: "project", subjectId: "p1", title: "Notes", fresh: true }
    ]);
    expect(api.sentTo("append-turn")[0]).toMatchObject({ projectId: "p1", conversationId: "proj-new", text: "hello" });
    expect(api.sentTo("send-panel-message")).toEqual([]);
    expect(api.sentTo("open-panel-thread")).toEqual([]);
    expect(asked).toEqual([]);
    expect(found).toEqual([]);
  });

  it("with no project open, sends into a conversation of the person's own project, and tells the panel which", async () => {
    const { api, conversation, asked, found } = dock(undefined, { projectId: "mine" });
    await conversation.send({ text: "hello", conversationId: undefined, projectId: undefined });
    expect(asked).toEqual(["first-project"]);
    expect(api.sentTo("open-conversation")).toEqual([{ projectId: "mine", subjectKind: "project", subjectId: "mine" }]);
    expect(api.sentTo("append-turn")[0]).toMatchObject({ projectId: "mine", conversationId: "proj-new", text: "hello" });
    expect(api.sentTo("send-panel-message")).toEqual([]);
    expect(found).toEqual(["mine"]);
  });

  it("with no project open, makes New chat in the person's project too, never an earlier-style chat", async () => {
    const { api, conversation, found } = dock(undefined, { projectId: "mine" });
    await conversation.newThread!({ projectId: "panel", title: "Notes" });
    expect(api.sentTo("open-conversation")).toEqual([{ projectId: "mine", subjectKind: "project", subjectId: "mine", title: "Notes", fresh: true }]);
    expect(api.sentTo("open-panel-thread")).toEqual([]);
    expect(found).toEqual(["mine"]);
  });

  it("never starts a chat on the reserved id of the earlier chats", async () => {
    const { api, conversation } = dock(undefined, { projectId: "mine" });
    await conversation.send({ text: "hi", conversationId: undefined, projectId: "panel" });
    expect(api.sentTo("open-conversation")[0]).toMatchObject({ projectId: "mine" });
    expect(api.sentTo("send-panel-message")).toEqual([]);
  });

  it("says why nothing was sent when no project could be found or made, and tells the panel nothing", async () => {
    const { api, conversation, found } = dock(undefined, { fails: true });
    const sent = await conversation.send({ text: "hello", conversationId: undefined, projectId: undefined });
    expect(sent).toMatchObject({ ok: false, code: "no_project", sentence: "FluxIQ could not make a project for this chat." });
    expect(api.sentTo("open-conversation")).toEqual([]);
    expect(found).toEqual([]);
  });
});

describe("an earlier chat with no project", () => {
  it("is read, continued and answered where it lives", async () => {
    const { api, conversation, asked } = dock({ projectId: "p1" });
    await conversation.listAllThreads!({ limit: 25 });
    await conversation.readThread({ projectId: "panel", conversationId: "panel-1", sinceTurnId: undefined, limit: 50 });
    await conversation.send({ text: "and again", conversationId: "panel-1", projectId: "panel" });
    await conversation.answer({ askId: "ask.allow", kind: "grant", value: undefined, projectId: "panel", turn: { conversationId: "panel-1", turnId: "t3" } });
    expect(api.sentTo("get-panel-thread")).toEqual([{ conversationId: "panel-1", limit: 50 }]);
    expect(api.sentTo("send-panel-message")).toEqual([{ text: "and again", conversationId: "panel-1", onScreen: { page: "flows" } }]);
    expect(api.sentTo("answer-panel-ask")).toMatchObject([{ askId: "ask.allow", kind: "grant" }]);
    expect(asked).toEqual([]);
  });

  it("is renamed and deleted where it lives, never storing the no-project prefix; a project chat in its project", async () => {
    const { api, conversation } = dock({ projectId: "p1" });
    await conversation.listAllThreads!({ limit: 25 });
    await conversation.renameThread!({ projectId: "panel", conversationId: "panel-1", title: "No project · Mine" });
    await conversation.renameThread!({ projectId: "p1", conversationId: "proj-1", title: "Roadmap" });
    await conversation.deleteThread!({ projectId: "panel", conversationId: "panel-1" });
    await conversation.deleteThread!({ projectId: "p1", conversationId: "proj-1" });
    expect(api.sentTo("rename-panel-thread")).toEqual([{ conversationId: "panel-1", title: "Mine" }]);
    expect(api.sentTo("rename-conversation")).toEqual([{ projectId: "p1", conversationId: "proj-1", title: "Roadmap" }]);
    expect(api.sentTo("delete-panel-thread")).toEqual([{ conversationId: "panel-1" }]);
    expect(api.sentTo("delete-conversation")).toEqual([{ projectId: "p1", conversationId: "proj-1" }]);
  });

  it("answers a project chat's choice through answer-ask in its project", async () => {
    const { api, conversation } = dock({ projectId: "p1" });
    await conversation.listAllThreads!({ limit: 25 });
    await conversation.answer({ askId: "ask.choice", kind: "choice", value: "oldest", projectId: "p1", turn: { conversationId: "proj-1", turnId: "t1" } });
    expect(api.sentTo("answer-ask")).toEqual([{ projectId: "p1", askId: "ask.choice", kind: "choice", value: "oldest" }]);
  });
});
