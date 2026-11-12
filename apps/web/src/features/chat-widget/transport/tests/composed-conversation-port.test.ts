// The docked Assistant with a project open: the person's own threads and the project's in one list, each call
// routed to the port the thread belongs to. With no project open it is the panel port alone, as before.

import { describe, expect, it } from "vitest";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { createProgramChatTransport } from "../program-chat-transport";

const OWN = { conversationId: "panel-1", projectId: "panel", status: "open", subject: { kind: "panel" }, title: "Weekly post build" };
const THEIRS = { conversationId: "proj-1", projectId: "p1", status: "open", subject: { kind: "project" }, title: "Planning notes" };
const UNTITLED = { conversationId: "proj-2", projectId: "p1", status: "open", subject: { kind: "run" }, title: null };
const OK = { ok: true as const, payload: {} };

function dock(open: { projectId: string; name?: string } | undefined) {
  const api = fakeProgramApi({
    "list-panel-threads": { ok: true, payload: { conversations: [OWN] } },
    "list-conversations": { ok: true, payload: { conversations: [THEIRS, UNTITLED] } },
    "get-panel-thread": OK, "get-conversation": OK, "send-panel-message": { ok: true, payload: { conversation: OWN } },
    "answer-panel-ask": OK, "answer-ask": OK, "rename-panel-thread": OK, "rename-conversation": OK,
    "delete-panel-thread": OK, "delete-conversation": OK, "open-panel-thread": OK, "append-turn": OK, "open-conversation": OK
  });
  const transport = createProgramChatTransport(api, {
    projectId: () => open?.projectId,
    panel: { onScreen: () => ({ page: "flows" }), openProject: () => open }
  });
  return { api, conversation: transport.conversation };
}

type Listed = { value: { conversations: Array<{ conversationId: string; title: string | null }> } };

describe("the dock's list with a project open", () => {
  it("lists the person's own threads first, then the project's, each project thread named for its project", async () => {
    const { api, conversation } = dock({ projectId: "p1", name: "Small project" });
    const listed = await conversation.listAllThreads!({ limit: 25 });
    expect(listed).toMatchObject({ ok: true });
    expect((listed as unknown as Listed).value.conversations.map((record) => [record.conversationId, record.title])).toEqual([
      ["panel-1", "Weekly post build"],
      ["proj-1", "Small project · Planning notes"],
      ["proj-2", "Small project · Chat"]
    ]);
    expect(api.sentTo("list-panel-threads")).toEqual([{ limit: 25 }]);
    expect(api.sentTo("list-conversations")).toEqual([{ projectId: "p1", limit: 25 }]);
  });

  it("falls back to a plain group name when the project has none, and says a failed project read", async () => {
    const { api, conversation } = dock({ projectId: "p1" });
    const listed = await conversation.listAllThreads!({ limit: 25 });
    expect((listed as unknown as Listed).value.conversations[1]?.title).toBe("This project · Planning notes");
    api.answer("list-conversations", { ok: false, status: 0, code: "request_failed" });
    expect(await conversation.listAllThreads!({ limit: 25 })).toMatchObject({ ok: false });
  });

  it("routes reads to the thread's own endpoint", async () => {
    const { api, conversation } = dock({ projectId: "p1" });
    await conversation.listAllThreads!({ limit: 25 });
    await conversation.readThread({ projectId: "panel", conversationId: "panel-1", sinceTurnId: undefined, limit: 50 });
    await conversation.readThread({ projectId: "p1", conversationId: "proj-1", sinceTurnId: "t2", limit: 50 });
    expect(api.sentTo("get-panel-thread")).toEqual([{ conversationId: "panel-1", limit: 50 }]);
    expect(api.sentTo("get-conversation")).toEqual([{ projectId: "p1", conversationId: "proj-1", sinceTurnId: "t2", limit: 50 }]);
  });

  it("routes a send into a project thread to the project, a send into a panel thread or a new one to the panel", async () => {
    const { api, conversation } = dock({ projectId: "p1" });
    await conversation.listAllThreads!({ limit: 25 });
    await conversation.send({ text: "hello", conversationId: "panel-1", projectId: "panel" });
    await conversation.send({ text: "hi", conversationId: undefined, projectId: undefined });
    await conversation.send({ text: "run it", conversationId: "proj-1", projectId: "p1" });
    expect(api.sentTo("send-panel-message")).toHaveLength(2);
    expect(api.sentTo("append-turn")).toHaveLength(1);
    expect(api.sentTo("append-turn")[0]).toMatchObject({ projectId: "p1", conversationId: "proj-1" });
  });

  it("answers a project thread's choice and words through answer-ask, a panel thread's through answer-panel-ask", async () => {
    const { api, conversation } = dock({ projectId: "p1" });
    await conversation.listAllThreads!({ limit: 25 });
    await conversation.answer({ askId: "ask.choice", kind: "choice", value: "oldest", projectId: "p1", turn: { conversationId: "proj-1", turnId: "t1" } });
    await conversation.answer({ askId: "ask.name", kind: "open", value: "Weekly roundup", projectId: "p1", turn: { conversationId: "proj-1", turnId: "t2" } });
    await conversation.answer({ askId: "ask.allow", kind: "grant", value: undefined, projectId: "panel", turn: { conversationId: "panel-1", turnId: "t3" } });
    expect(api.sentTo("answer-ask")).toEqual([
      { projectId: "p1", askId: "ask.choice", kind: "choice", value: "oldest" },
      { projectId: "p1", askId: "ask.name", kind: "open", value: "Weekly roundup" }
    ]);
    expect(api.sentTo("answer-panel-ask")).toMatchObject([{ askId: "ask.allow", kind: "grant" }]);
  });

  it("renames and deletes through the thread's own endpoint, never storing the project prefix", async () => {
    const { api, conversation } = dock({ projectId: "p1", name: "Small project" });
    await conversation.listAllThreads!({ limit: 25 });
    await conversation.renameThread!({ projectId: "p1", conversationId: "proj-1", title: "Small project · Roadmap" });
    await conversation.renameThread!({ projectId: "panel", conversationId: "panel-1", title: "Mine" });
    await conversation.deleteThread!({ projectId: "p1", conversationId: "proj-1" });
    await conversation.deleteThread!({ projectId: "panel", conversationId: "panel-1" });
    expect(api.sentTo("rename-conversation")).toEqual([{ projectId: "p1", conversationId: "proj-1", title: "Roadmap" }]);
    expect(api.sentTo("rename-panel-thread")).toEqual([{ conversationId: "panel-1", title: "Mine" }]);
    expect(api.sentTo("delete-conversation")).toEqual([{ projectId: "p1", conversationId: "proj-1" }]);
    expect(api.sentTo("delete-panel-thread")).toEqual([{ conversationId: "panel-1" }]);
  });

  it("opens a new chat as the person's own", async () => {
    const { api, conversation } = dock({ projectId: "p1" });
    await conversation.newThread!({ title: "Notes" });
    expect(api.sentTo("open-panel-thread")).toEqual([{ title: "Notes" }]);
    expect(api.sentTo("open-conversation")).toEqual([]);
  });
});

describe("the dock's list with no project open", () => {
  it("is the person's own threads alone, and never reads a project's", async () => {
    const { api, conversation } = dock(undefined);
    const listed = await conversation.listAllThreads!({ limit: 25 });
    expect(listed).toEqual({ ok: true, value: { conversations: [OWN] } });
    expect(api.sentTo("list-conversations")).toEqual([]);
    await conversation.answer({ askId: "a", kind: "grant", value: undefined, projectId: "panel", turn: { conversationId: "panel-1", turnId: "t" } });
    expect(api.sentTo("answer-panel-ask")).toHaveLength(1);
  });
});
