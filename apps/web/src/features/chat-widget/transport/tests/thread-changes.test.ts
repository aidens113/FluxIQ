// The thread list's New chat, Rename and Delete over Core's endpoints.

import { describe, expect, it } from "vitest";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { createConversationPort } from "../conversation-port";
import { createPanelConversationPort } from "../panel-conversation-port";

const NEW = { conversationId: "conv-9", projectId: "p1", status: "open", subjectKind: "project", subjectId: "p1" };

function port(answers: Parameters<typeof fakeProgramApi>[0] = {}, project: string | null = "p1") {
  const api = fakeProgramApi(answers);
  return { api, port: createConversationPort(api, { projectId: () => project ?? undefined }) };
}

describe("New chat", () => {
  it("opens a fresh thread about the project, never continuing the open one", async () => {
    const { api, port: conversation } = port({ "open-conversation": { ok: true, payload: { conversation: NEW } } });
    expect(await conversation.newThread!({})).toEqual({ ok: true, value: { conversation: NEW } });
    expect(api.sentTo("open-conversation")).toEqual([{ projectId: "p1", subjectKind: "project", subjectId: "p1", fresh: true }]);
  });

  it("says so when no project is open, without asking Core", async () => {
    const { api, port: conversation } = port({}, null);
    expect(await conversation.newThread!({})).toMatchObject({ ok: false, code: "no_project" });
    expect(api.calls).toEqual([]);
  });
});

describe("Rename", () => {
  it("sends the trimmed name for the thread, in the project the request names", async () => {
    const { api, port: conversation } = port({ "rename-conversation": { ok: true, payload: { conversation: NEW } } });
    expect(await conversation.renameThread!({ projectId: "p2", conversationId: "conv-9", title: "  Loans  " })).toEqual({ ok: true, value: { conversation: NEW } });
    expect(api.sentTo("rename-conversation")).toEqual([{ projectId: "p2", conversationId: "conv-9", title: "Loans" }]);
  });

  it("names no project when none is known, so Core finds the thread itself", async () => {
    const { api, port: conversation } = port({ "rename-conversation": { ok: true, payload: {} } }, null);
    await conversation.renameThread!({ conversationId: "conv-9", title: "Loans" });
    expect(api.sentTo("rename-conversation")[0]).not.toHaveProperty("projectId");
  });

  it("refuses an empty name without asking Core", async () => {
    const { api, port: conversation } = port();
    expect(await conversation.renameThread!({ conversationId: "conv-9", title: "  " })).toMatchObject({ ok: false, code: "invalid_request" });
    expect(api.calls).toEqual([]);
  });
});

describe("Delete", () => {
  it("deletes the thread and says so", async () => {
    const { api, port: conversation } = port({ "delete-conversation": { ok: true, payload: { deleted: true, conversationId: "conv-9" } } });
    expect(await conversation.deleteThread!({ conversationId: "conv-9" })).toEqual({ ok: true, value: { deleted: true, conversationId: "conv-9" } });
    expect(api.sentTo("delete-conversation")).toEqual([{ projectId: "p1", conversationId: "conv-9" }]);
  });

  it("passes Core's refusal of a thread still in use, with its code and sentence", async () => {
    const { port: conversation } = port({ "delete-conversation": { ok: false, status: 409, errorCode: "conversation_run_active", error: "A run is still using this chat." } });
    expect(await conversation.deleteThread!({ conversationId: "conv-9" })).toMatchObject({ ok: false, code: "conversation_run_active", sentence: "A run is still using this chat." });
  });
});

describe("the panel assistant's thread list", () => {
  it("opens a new chat through its own endpoint and offers no rename or delete, which Core has none for", async () => {
    const api = fakeProgramApi({ "open-panel-thread": { ok: true, payload: { conversation: NEW } } });
    const conversation = createPanelConversationPort(api, { onScreen: () => ({}) });
    expect(await conversation.newThread!({ title: "Hello" })).toEqual({ ok: true, value: { conversation: NEW } });
    expect(api.sentTo("open-panel-thread")).toEqual([{ title: "Hello" }]);
    expect(conversation.renameThread).toBeUndefined();
    expect(conversation.deleteThread).toBeUndefined();
  });
});
