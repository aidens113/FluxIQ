// What the chat's conversation port adds for the Studio's window: the thread
// list across projects, what a host has on screen, Core's `problem`, a send's
// own failure code, and telling the rest of the panel a thread moved.

import { describe, expect, it } from "vitest";
import { subscribeToAutomationStudioMutations } from "../../../automation-studio/stores";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { createConversationPort } from "../conversation-port";

const OPENED = { conversationId: "conv-1", projectId: "p1", status: "open", subjectKind: "project", subjectId: "p1" };

function port(answers: Parameters<typeof fakeProgramApi>[0] = {}, host: { project?: string; onScreen?: () => Record<string, string> } = {}) {
  const api = fakeProgramApi(answers);
  return { api, port: createConversationPort(api, { projectId: () => host.project, ...(host.onScreen ? { onScreen: host.onScreen } : {}) }) };
}

describe("the thread list", () => {
  it("lists one project's threads, whatever their status, or every project the person can see", async () => {
    const { api, port: conversation } = port({ "list-conversations": { ok: true, payload: { conversations: [OPENED] } } });
    expect(await conversation.listAllThreads!({ projectId: "p1", limit: 25 })).toEqual({ ok: true, value: { conversations: [OPENED] } });
    await conversation.listAllThreads!({ limit: 25 });
    expect(api.sentTo("list-conversations")).toEqual([{ projectId: "p1", limit: 25 }, { projectId: null, limit: 25 }]);
  });

  it("answers a failed list as a failure the chat can say", async () => {
    const { port: conversation } = port({ "list-conversations": { ok: false, status: 0, code: "request_failed" } });
    expect(await conversation.listAllThreads!({ limit: 25 })).toMatchObject({ ok: false, code: "unreachable" });
  });

  it("answers an empty list, not a failure, when no project is open and none is named", async () => {
    const { api, port: conversation } = port();
    expect(await conversation.listThreads({ subjectKind: "project", status: "open", limit: 1 })).toEqual({ ok: true, value: { conversations: [] } });
    expect(api.calls).toEqual([]);
  });
});

describe("a message sent from the window", () => {
  it("carries what the panel has open, over anything the chat guessed", async () => {
    const { api, port: conversation } = port({ "append-turn": { ok: true, payload: {} } }, { onScreen: () => ({ flowId: "flow.kettle-1", runId: "run.9" }) });
    await conversation.send({ text: " run it ", conversationId: "conv-1", projectId: "p1", onScreen: { flowId: "flow.guess", recordingId: "rec.1" } });
    expect(api.sentTo("append-turn")[0]).toMatchObject({ projectId: "p1", conversationId: "conv-1", text: "run it", onScreen: { flowId: "flow.kettle-1", runId: "run.9", recordingId: "rec.1" } });
  });

  it("sends no onScreen at all when nothing is open", async () => {
    const { api, port: conversation } = port({ "append-turn": { ok: true, payload: {} } });
    await conversation.send({ text: "hi", conversationId: "conv-1", projectId: "p1" });
    expect(api.sentTo("append-turn")[0]).not.toHaveProperty("onScreen");
  });

  it("passes Core's problem when the message was stored but its answer could not be written", async () => {
    const { port: conversation } = port({ "append-turn": { ok: true, payload: { problem: "Your message was saved, but my answer could not be written into the thread: disk full" } } });
    expect(await conversation.send({ text: "hi", conversationId: "conv-1", projectId: "p1" })).toEqual({
      ok: true,
      value: { problem: "Your message was saved, but my answer could not be written into the thread: disk full" }
    });
  });

  it("keeps the code of a refusal, and says a signed-out panel is signed out", async () => {
    const forbidden = port({ "append-turn": { ok: false, status: 403, code: "permission_denied", error: "Not allowed." } });
    expect(await forbidden.port.send({ text: "hi", conversationId: "conv-1", projectId: "p1" })).toMatchObject({ ok: false, code: "permission_denied", sentence: "Not allowed." });
    const signedOut = port({ "append-turn": { ok: false, status: 401, error: "Sign in." } });
    expect(await signedOut.port.send({ text: "hi", conversationId: "conv-1", projectId: "p1" })).toMatchObject({ ok: false, code: "refused" });
  });

  it("tells the rest of the panel the thread moved, only once the message was taken", async () => {
    const heard: unknown[] = [];
    const stop = subscribeToAutomationStudioMutations((transaction) => heard.push(transaction.mutation), { kinds: ["conversation.changed"] });
    const taken = port({ "open-conversation": { ok: true, payload: { conversation: OPENED } }, "append-turn": { ok: true, payload: {} } });
    await taken.port.send({ text: "hi", conversationId: undefined, projectId: "p1" });
    const refused = port({ "append-turn": { ok: false, status: 500, error: "Core is busy." } });
    await refused.port.send({ text: "hi", conversationId: "conv-2", projectId: "p1" });
    stop();
    expect(heard).toEqual([{ kind: "conversation.changed", projectId: "p1", conversationId: "conv-1" }]);
  });
});
