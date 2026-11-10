import { expect, expectTypeOf, test } from "vitest";
import type { ChatConversationPort, ChatOnScreen, ChatSelection, ChatSend, ChatSubjectKind, ChatThreadListQuery } from "../index.ts";

test("the panel-wide subject kind type-checks beside the existing ones", () => {
  const kinds: ChatSubjectKind[] = ["project", "flow", "run", "panel"];
  expect(kinds).toContain("panel");
  const query: ChatThreadListQuery = { subjectKind: "panel", status: "open", limit: 1 };
  expect(query.subjectKind).toBe("panel");
});

test("a panel message carries the page and selection on screen, and the transport receives them unchanged", async () => {
  const selection: ChatSelection = {
    projectId: "p1",
    flowId: "f1",
    stepNumbers: [1, 2],
    nodeIds: ["n1"],
    runId: "r1",
    datasetId: "d1",
    keyId: "k1",
    folder: "Imports"
  };
  const onScreen: ChatOnScreen = { page: "flows", selection, recordingId: "rec-1" };
  const message: ChatSend = {
    text: "what is on this page",
    conversationId: undefined,
    projectId: "p1",
    subjectKind: "panel",
    onScreen
  };

  const sent: ChatSend[] = [];
  const conversation: Pick<ChatConversationPort, "send"> = {
    send: async (received) => {
      sent.push(received);
      return { ok: true, value: {} };
    }
  };
  await conversation.send(message);

  expect(sent).toHaveLength(1);
  expect(sent[0]).toBe(message);
  expect(sent[0]?.onScreen).toEqual({ page: "flows", selection, recordingId: "rec-1" });
  expectTypeOf<ChatOnScreen["page"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<ChatOnScreen["selection"]>().toEqualTypeOf<ChatSelection | undefined>();
});

test("the new onScreen fields are optional: a message with none still type-checks and sends as before", async () => {
  const bare: ChatSend = { text: "hi", conversationId: undefined, projectId: undefined, onScreen: { flowId: "f1" } };
  const sent: ChatSend[] = [];
  const conversation: Pick<ChatConversationPort, "send"> = {
    send: async (received) => {
      sent.push(received);
      return { ok: true, value: {} };
    }
  };
  await conversation.send(bare);
  expect(sent[0]?.onScreen).toEqual({ flowId: "f1" });
  expect(sent[0]?.onScreen?.page).toBeUndefined();
  expect(sent[0]?.onScreen?.selection).toBeUndefined();
});
