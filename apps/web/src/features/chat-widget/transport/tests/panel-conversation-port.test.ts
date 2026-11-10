// The transport's panel branch: panel threads go to the assistant's own endpoints, carry the page and
// selection on every send, and name no project. The project branch is untouched (conversation-port.test.ts).

import { describe, expect, it } from "vitest";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { createProgramChatTransport } from "../program-chat-transport";

const THREAD = { conversationId: "panel-1", projectId: "panel", status: "open", subjectKind: "panel", subjectId: "panel" };
const ON_SCREEN = { page: "flows", selection: { flowId: "flow.a", stepNumbers: [5] }, flowId: "flow.a" };

function panel(answers: Parameters<typeof fakeProgramApi>[0] = {}) {
  const api = fakeProgramApi(answers);
  const transport = createProgramChatTransport(api, { projectId: () => undefined, panel: { onScreen: () => ON_SCREEN } });
  return { api, conversation: transport.conversation };
}

describe("the panel transport branch", () => {
  it("lists panel threads from list-panel-threads, with no project", async () => {
    const { api, conversation } = panel({ "list-panel-threads": { ok: true, payload: { conversations: [THREAD] } } });
    expect(await conversation.listAllThreads!({ limit: 25 })).toEqual({ ok: true, value: { conversations: [THREAD] } });
    await conversation.listThreads({ subjectKind: "panel", status: "open", limit: 1 });
    expect(api.sentTo("list-panel-threads")).toEqual([{ limit: 25 }, { limit: 1 }]);
    expect(api.sentTo("list-conversations")).toEqual([]);
  });

  it("reads a thread forward from get-panel-thread", async () => {
    const { api, conversation } = panel({ "get-panel-thread": { ok: true, payload: { conversation: { conversation: THREAD, turns: [], hasMore: false } } } });
    await conversation.readThread({ projectId: "ignored", conversationId: "panel-1", sinceTurnId: "t3", limit: 50 });
    expect(api.sentTo("get-panel-thread")).toEqual([{ conversationId: "panel-1", sinceTurnId: "t3", limit: 50 }]);
  });

  it("sends the page and selection with every message, over what the chat guessed", async () => {
    const { api, conversation } = panel({ "send-panel-message": { ok: true, payload: { conversation: THREAD, turn: {} } } });
    const sent = await conversation.send({ text: " rename step 5 ", conversationId: "panel-1", projectId: undefined, onScreen: { flowId: "flow.guess", recordingId: "rec.1" } });
    expect(sent).toEqual({ ok: true, value: { conversation: THREAD } });
    expect(api.sentTo("send-panel-message")).toEqual([{
      text: "rename step 5",
      conversationId: "panel-1",
      onScreen: { flowId: "flow.a", recordingId: "rec.1", page: "flows", selection: { flowId: "flow.a", stepNumbers: [5] } }
    }]);
    expect(api.sentTo("append-turn")).toEqual([]);
  });

  it("starts a thread by sending, with its title only when there is no thread yet", async () => {
    const { api, conversation } = panel({ "send-panel-message": { ok: true, payload: { conversation: THREAD } } });
    await conversation.send({ text: "hi", conversationId: undefined, projectId: undefined, title: "Hello" });
    await conversation.send({ text: "again", conversationId: "panel-1", projectId: undefined, title: "Hello" });
    const [first, second] = api.sentTo("send-panel-message");
    expect(first).toMatchObject({ title: "Hello" });
    expect(first).not.toHaveProperty("conversationId");
    expect(second).not.toHaveProperty("title");
    expect(api.sentTo("open-conversation")).toEqual([]);
  });

  it("refuses an empty message without asking Core", async () => {
    const { api, conversation } = panel();
    expect(await conversation.send({ text: "  ", conversationId: undefined, projectId: undefined })).toMatchObject({ ok: false, code: "invalid_request" });
    expect(api.calls).toEqual([]);
  });

  it("answers a failed send as a failure the chat can say", async () => {
    const { conversation } = panel({ "send-panel-message": { ok: false, status: 403, code: "permission_denied", error: "Not allowed." } });
    expect(await conversation.send({ text: "hi", conversationId: "panel-1", projectId: undefined })).toMatchObject({ ok: false, code: "permission_denied", sentence: "Not allowed." });
  });

  it("answers an Allow card through answer-panel-ask, with the page and selection", async () => {
    const { api, conversation } = panel({ "answer-panel-ask": { ok: true, payload: { ask: { askId: "ask-1" } } } });
    expect(await conversation.answer({ askId: "ask-1", kind: "grant", value: undefined, projectId: undefined })).toEqual({ ok: true, value: { ask: { askId: "ask-1" } } });
    expect(api.sentTo("answer-panel-ask")).toEqual([{ askId: "ask-1", kind: "grant", onScreen: ON_SCREEN }]);
    expect(api.sentTo("answer-ask")).toEqual([]);
  });

  it("leaves the project branch alone when no panel option is given", async () => {
    const api = fakeProgramApi({ "list-conversations": { ok: true, payload: { conversations: [] } } });
    const transport = createProgramChatTransport(api, { projectId: () => "p1" });
    await transport.conversation.listAllThreads!({ projectId: "p1", limit: 25 });
    expect(api.sentTo("list-conversations")).toEqual([{ projectId: "p1", limit: 25 }]);
    expect(api.sentTo("list-panel-threads")).toEqual([]);
  });
});
