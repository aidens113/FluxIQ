import { describe, expect, it } from "vitest";
import type { Conversation } from "../../automation-studio/conversation";
import { chatHref } from "../chat-href";
import { chatRows } from "../chat-rows";

const chat = (id: string, over: Partial<Conversation> = {}): Conversation => ({
  conversationId: id, projectId: "p1", subject: { kind: "project", id: "p1" }, status: "open",
  title: null, turnCount: 2, pendingAskCount: 0, createdAt: 1, updatedAt: 1, ...over
});

describe("chatRows", () => {
  const names = new Map([["p1", "Shop"]]);
  it("lists newest first, naming the project and giving each chat a page", () => {
    const rows = chatRows([chat("a", { updatedAt: 1 }), chat("b", { updatedAt: 9, title: "Prices", status: "resolved", projectId: "p2" })], names);
    expect(rows.map((row) => row.conversationId)).toEqual(["b", "a"]);
    expect(rows[0]).toMatchObject({ title: "Prices", projectName: "p2", status: "resolved", href: "/chats/b?project=p2" });
    expect(rows[1]).toMatchObject({ title: "Untitled chat", projectName: "Shop" });
  });
  it("searches by title or project name", () => {
    const rows = chatRows([chat("a", { title: "Prices" }), chat("b", { title: "Reviews" })], names, "price");
    expect(rows.map((row) => row.conversationId)).toEqual(["a"]);
    expect(chatRows([chat("a")], names, "shop")).toHaveLength(1);
  });
  it("encodes the address", () => {
    expect(chatHref("a/b", "p 1")).toBe("/chats/a%2Fb?project=p%201");
  });
});
