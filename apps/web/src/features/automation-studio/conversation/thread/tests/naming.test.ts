// What a thread is called: Core's title, the project's name, or a plain noun.
// Never a raw id.

import { describe, expect, it } from "vitest";
import { conversationDisplayTitle, conversationSubjectLabel, type Conversation } from "..";

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
    expect(conversationDisplayTitle(thread({ title: "Nightly listings run" }), "Company website")).toBe("Nightly listings run");
  });

  it("heads a project thread with the project's name", () => {
    expect(conversationDisplayTitle(thread(), "Company website")).toBe("Company website");
  });

  it("names a run or a Flow Core did not title by its kind, in its project", () => {
    expect(conversationDisplayTitle(thread({ subject: { kind: "run", id: "run.7" } }), "Company website")).toBe("This run · Company website");
    expect(conversationDisplayTitle(thread({ subject: { kind: "flow", id: "flow.1" } }), null)).toBe("This Flow");
  });

  it("never shows a raw id, not even one Core put in a title", () => {
    for (const name of [
      conversationSubjectLabel(thread()),
      conversationDisplayTitle(thread(), null),
      conversationDisplayTitle(thread({ title: `Project ${PROJECT_ID}` }), null),
      conversationDisplayTitle(thread({ title: "Run 3f9a0c1d2e4b5a6978" }), "Company website")
    ]) {
      expect(name).not.toMatch(/[0-9a-f]{8}-|[0-9a-f]{16}/u);
    }
  });

  it("spans every project when no thread and no project is open", () => {
    expect(conversationDisplayTitle(null, null)).toBe("All projects");
    expect(conversationDisplayTitle(null, "  Company website ")).toBe("Company website");
  });
});
