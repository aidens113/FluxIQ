// A turn reads as a chat: the person's words in a bubble on the right,
// FluxIQ's formatted across the full width, and who said it kept for a screen
// reader rather than drawn over every message.

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/components/overlays/Modal", () => ({
  Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section>
}));

import { ConversationTurn } from "../components";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function render(author: "person" | "automation", text: string): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <ConversationTurn
        busy={false}
        onAnswer={async () => true}
        projectId="project.one"
        turn={{ turnId: "turn.1", conversationId: "c.1", author, createdAt: 1_790_000_000_000, text } as any}
      />
    );
  });
  return renderer;
}

describe("a turn in the chat", () => {
  it("puts the person's words in a bubble, as written", () => {
    const renderer = render("person", "Collect **every** product");
    const article = renderer.root.findByType("article");
    expect(article.props.className).toContain("person");
    const bubble = renderer.root.findByProps({ className: "automation-conversation-bubble" });
    expect(bubble.children).toEqual(["Collect **every** product"]);
  });

  it("formats FluxIQ's words: bold, code and a list", () => {
    const renderer = render("automation", "I built **Product list**. It collects:\n- the name\n- its price\nIt found `12`.");
    const text = renderer.root.findByProps({ className: "automation-conversation-text" });
    expect(text.findByType("strong").children).toEqual(["Product list"]);
    expect(renderer.root.findAllByType("li")).toHaveLength(2);
    expect(renderer.root.findByType("code").children).toEqual(["12"]);
  });

  it("keeps who said it and when for a screen reader, not as a drawn header", () => {
    const renderer = render("automation", "Done.");
    const meta = renderer.root.findByProps({ className: "automation-conversation-turn-meta" });
    expect(meta.findByType("strong").children).toEqual(["FluxIQ"]);
    expect(meta.findAllByType("time")).toHaveLength(1);
    expect(renderer.root.findAllByType("svg")).toHaveLength(0);
  });
});
