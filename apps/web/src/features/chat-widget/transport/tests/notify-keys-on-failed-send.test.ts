import type { ChatConversationPort, ChatSend } from "@fluxiq/ui-components";
import { describe, expect, it, vi } from "vitest";
import { createPanelModelKeysPort } from "../../../model-keys";
import { createProgramChatTransport, notifyKeysOnFailedSend } from "..";
import { fakeProgramApi } from "../../tests/fake-program-api";

type Sent = Awaited<ReturnType<ChatConversationPort["send"]>>;
const conversationAnswering = (result: Sent): ChatConversationPort => ({ send: async () => result }) as unknown as ChatConversationPort;
const message: ChatSend = { text: "hello", projectId: "p1", conversationId: "conv-1" };

describe("a message that failed", () => {
  it("tells whatever shows the AI key to read it again, whether it failed or came back with a problem", async () => {
    const heard = vi.fn();
    await notifyKeysOnFailedSend(conversationAnswering({ ok: false, code: "failed", sentence: "no" }), heard).send(message);
    await notifyKeysOnFailedSend(conversationAnswering({ ok: true, value: { problem: "The model did not answer." } }), heard).send(message);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("reads nothing after a message that went well", async () => {
    const heard = vi.fn();
    const result = await notifyKeysOnFailedSend(conversationAnswering({ ok: true, value: {} }), heard).send(message);
    expect(result.ok).toBe(true);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("the chat transport and the key card", () => {
  it("hands the key port to the chat as modelKeys, so its empty state shows the card", () => {
    const secretKeys = fakeProgramApi({});
    const modelKeys = createPanelModelKeysPort(secretKeys);
    const transport = createProgramChatTransport(fakeProgramApi({}), { projectId: () => "p1", secretKeys, modelKeys });
    expect(transport.modelKeys).toBe(modelKeys);
    expect(createProgramChatTransport(fakeProgramApi({}), { projectId: () => "p1" }).modelKeys).toBeUndefined();
  });

  it("tells the key port when a send fails", async () => {
    const secretKeys = fakeProgramApi({});
    const modelKeys = createPanelModelKeysPort(secretKeys);
    const heard = vi.fn();
    modelKeys.onChange(heard);
    const api = fakeProgramApi({ "append-turn": { ok: false, error: "no" } });
    const transport = createProgramChatTransport(api, { projectId: () => "p1", secretKeys, modelKeys });
    await transport.conversation.send(message);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
