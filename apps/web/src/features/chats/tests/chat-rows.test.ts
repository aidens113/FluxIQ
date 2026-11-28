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
    expect(rows[0]).toMatchObject({ title: "Prices", projectName: "Another project", status: "resolved", href: "/chats/b?project=p2" });
    expect(rows[1]).toMatchObject({ projectName: "Shop" });
    expect(rows[1]!.title).toMatch(/^Chat from /);
  });
  it("searches by title or project name", () => {
    const rows = chatRows([chat("a", { title: "Prices" }), chat("b", { title: "Reviews" })], names, "price");
    expect(rows.map((row) => row.conversationId)).toEqual(["a"]);
    expect(chatRows([chat("a")], names, "shop")).toHaveLength(1);
  });
  it("says an earlier chat has no project, opens it where it lives, and never prints or links the internal project id", () => {
    const rows = chatRows([chat("a", { projectId: "panel", title: "Invoices" }), chat("b", { projectId: "panel" })], names);
    expect(rows.map((row) => row.projectName)).toEqual(["No project (an earlier chat)", "No project (an earlier chat)"]);
    expect(rows.find((row) => row.conversationId === "b")!.title).toMatch(/^Chat from /);
    expect(rows.map((row) => row.href).sort()).toEqual(["/chats/a", "/chats/b"]);
    expect(JSON.stringify(rows.map((row) => [row.title, row.projectName, row.href]))).not.toMatch(/panel|Assistant/u);
  });
  it("gives an untitled chat a dated name, never Untitled chat", () => {
    const [row] = chatRows([chat("a", { title: "  " })], names);
    expect(row!.title).toMatch(/^Chat from /);
    expect(row!.title).not.toContain("Untitled");
  });
  it("encodes the address", () => {
    expect(chatHref("a/b", "p 1")).toBe("/chats/a%2Fb?project=p%201");
  });
});
