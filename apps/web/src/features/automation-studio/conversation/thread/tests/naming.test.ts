// What the globally mounted prompt calls a thread: Core's title or a plain
// noun, never a raw id.

import { describe, expect, it } from "vitest";
import { conversationSubjectLabel, type Conversation } from "..";

const PROJECT_ID = "820f86f0-ba20-4847-8631-ca4f85f6b97d";

function thread(overrides: Partial<Conversation> = {}): Conversation {
  return {
    conversationId: "conversation.1",
    projectId: PROJECT_ID,
    subject: { kind: "project", id: PROJECT_ID },
    status: "open",
    title: null,
    turnCount: 0,
    pendingAskCount: 0,
    createdAt: 1,
    updatedAt: 2,
    ...overrides
  };
}

describe("what a thread is called", () => {
  it("uses Core's own title when it gave one", () => {
    expect(conversationSubjectLabel(thread({ title: "Nightly listings run" }))).toBe("Nightly listings run");
  });

  it("names a thread Core did not title by its kind", () => {
    expect(conversationSubjectLabel(thread())).toBe("This project");
    expect(conversationSubjectLabel(thread({ subject: { kind: "run", id: "run.7" } }))).toBe("This run");
    expect(conversationSubjectLabel(thread({ subject: { kind: "flow", id: "flow.1" } }))).toBe("This Flow");
  });

  it("never shows a raw id, not even one Core put in a title", () => {
    for (const name of [
      conversationSubjectLabel(thread()),
      conversationSubjectLabel(thread({ title: `Project ${PROJECT_ID}` })),
      conversationSubjectLabel(thread({ title: "Run 3f9a0c1d2e4b5a6978" }))
    ]) {
      expect(name).not.toMatch(/[0-9a-f]{8}-|[0-9a-f]{16}/u);
    }
  });
});
