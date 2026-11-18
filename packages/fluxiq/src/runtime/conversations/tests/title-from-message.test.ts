import { describe, expect, it } from "vitest";
import { automationStudioConversationTitleFromMessage } from "../title-from-message.ts";

describe("a thread's title from its first message", () => {
  it("collapses whitespace and keeps a short message whole", () => {
    expect(automationStudioConversationTitleFromMessage("  list my\n flows ")).toBe("list my flows");
  });

  it("cuts a long message at a word with an ellipsis", () => {
    const title = automationStudioConversationTitleFromMessage("Please collect every open listing from the marketplace and put the prices in a sheet for me");
    expect(title!.length).toBeLessThanOrEqual(60);
    expect(title!.endsWith("\u2026")).toBe(true);
    expect(title).toBe("Please collect every open listing from the marketplace and\u2026");
  });

  it("gives nothing for a message that says nothing", () => {
    expect(automationStudioConversationTitleFromMessage(" \n ")).toBeNull();
  });
});
