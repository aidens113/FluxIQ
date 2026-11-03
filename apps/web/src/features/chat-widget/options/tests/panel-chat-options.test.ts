// How this panel mounts the chat: the options the Studio's window and the
// chat-alone route share, in the words and numbers the old conversation used.

import { describe, expect, it } from "vitest";
import { panelChatOptions } from "../panel-chat-options";

const input = {
  asks: { present: () => null },
  attachments: { label: () => "Attachment", drawer: () => null },
  openControl: () => { throw new Error("not drawn here"); },
  threads: {}
};

describe("the chat's options in this panel", () => {
  const options = panelChatOptions(input);

  it("opens on the three arrivals instead of the page onboarding", () => {
    expect(options.welcome?.title).toBe("This is where FluxIQ talks to you");
    expect(options.welcome?.items.map((item) => item.title)).toEqual([
      "Permission before anything lasting",
      "A decision only you can make",
      "What it did, and what changed"
    ]);
  });

  it("says why there is nowhere to send, and signs the person out in the panel's own words", () => {
    expect(options.threads?.unavailableReason).toContain("Open a project to start a conversation.");
    expect(options.fallback?.title).not.toContain("FluxIQ window");
    expect(options.fallback?.line).not.toContain("FluxIQ window");
  });

  it("bounds the transcript, announces who spoke and when, and warns of a waiting question", () => {
    expect(options.history).toEqual({ window: 200 });
    expect(options.turnMeta?.formatTime(0)).toBe(new Date(0).toLocaleString());
    expect(options.pendingBanner).toBe(true);
    expect(options.contextLine).toBe(false);
  });

  it("limits the composer to the conversation's length, keeps the draft in memory and says the keys", () => {
    expect(options.composer).toEqual({
      maxLength: 8000,
      remainingHintBelow: 500,
      keepDraft: false,
      sendHint: "Send (Enter). Shift and Enter start a new line."
    });
  });

  it("passes the host's thread callbacks through and never sets an owner key itself", () => {
    const heard: string[] = [];
    const withHost = panelChatOptions({ ...input, threads: { initialConversationId: "conversation.2", onSelected: (id) => heard.push(id) } });
    withHost.threads?.onSelected?.("conversation.3");
    expect(withHost.threads?.initialConversationId).toBe("conversation.2");
    expect(heard).toEqual(["conversation.3"]);
    expect(options).not.toHaveProperty("ownerKey");
  });
});
