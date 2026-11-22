import { describe, expect, it } from "vitest";
import { automationStudioConversationDeclaredActs } from "../acts.ts";

describe("the chat's declared task acts", () => {
  it("reads the same answer object, orders known classes and never derives permission from the person's words", () => {
    expect(automationStudioConversationDeclaredActs('```json\n{"acts":["delete","MOVE_MONEY","delete","unknown"]}\n```')).toEqual(["move_money", "delete"]);
    expect(automationStudioConversationDeclaredActs({ acts: [] })).toEqual([]);
    expect(automationStudioConversationDeclaredActs({ reply: "Please delete it" })).toBeNull();
    expect(automationStudioConversationDeclaredActs({ acts: "delete" })).toBeNull();
  });
});
