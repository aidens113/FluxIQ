import { describe, expect, it } from "vitest";
import { parsePanelThreads } from "../parse-panel-threads";

describe("parsePanelThreads", () => {
  it("reads the flat records list-panel-threads answers", () => {
    const chats = parsePanelThreads([{ conversationId: "a1", projectId: "panel", status: "open", subjectKind: "panel", subjectId: "panel", title: "Hi", turnCount: 2, createdAt: 1, updatedAt: 2 }]);
    expect(chats).toEqual([{ conversationId: "a1", projectId: "panel", subject: { kind: "project", id: "panel" }, status: "open", title: "Hi", turnCount: 2, pendingAskCount: 0, createdAt: 1, updatedAt: 2 }]);
  });
  it("drops only a bad record", () => {
    expect(parsePanelThreads([{ conversationId: "", status: "open", createdAt: 1, updatedAt: 1 }, null, { conversationId: "ok", status: "resolved", createdAt: 1, updatedAt: 1 }]).map((chat) => chat.conversationId)).toEqual(["ok"]);
    expect(parsePanelThreads(undefined)).toEqual([]);
  });
});
