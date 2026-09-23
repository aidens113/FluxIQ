import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/components/overlays/Modal", () => ({
  Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section>
}));

import { ConversationViewContent } from "../components";
import { CONVERSATION_VISIBLE_TURNS } from "../thread";
import type { ConversationCommands } from "../conversation-host";
import { conversationThreadPage } from "../turn-queries";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const conversation = {
  conversationId: "conversation.1",
  projectId: "project.one",
  subject: { kind: "flow", id: "flow.checkout" },
  status: "open",
  title: "Checkout flow",
  revision: 5_000,
  turnCount: 5_000,
  pendingAskCount: 0,
  createdAt: 0,
  updatedAt: 5_000
};

const turns = Array.from({ length: 5_000 }, (_, index) => ({
  turnId: `turn.${String(index).padStart(5, "0")}`,
  conversationId: "conversation.1",
  author: index % 2 === 0 ? "automation" : "person",
  createdAt: index,
  text: `Turn ${index}.`
}));

function commands() {
  const detailCalls: Array<Record<string, unknown>> = [];
  return {
    detailCalls,
    listConversations: vi.fn(async () => ({ ok: true, payload: { conversations: [conversation] } })),
    loadConversation: vi.fn(async (payload: Record<string, unknown>) => {
      detailCalls.push(payload);
      return { ok: true, page: conversationThreadPage({ conversation, turns, hasMore: false }) };
    }),
    appendTurn: vi.fn(async () => ({ ok: true, payload: {} })),
    answerAsk: vi.fn(async () => ({ ok: true, payload: {} }))
  } as unknown as ConversationCommands & { detailCalls: Array<Record<string, unknown>> };
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByType("button").find((candidate) =>
    candidate.findAll((node) => node.children.some((child) => child === label), { deep: true }).length > 0
  );
}

describe("a long conversation", () => {
  it("mounts a bounded tail of a five-thousand-turn thread and keeps the rest one press away", async () => {
    const api = commands();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ConversationViewContent commands={api} projectId="project.one" />);
    });
    await act(async () => { await Promise.resolve(); });

    const list = renderer.root.findByProps({ "aria-label": "Conversation transcript" });
    expect(list.findAllByType("article")).toHaveLength(CONVERSATION_VISIBLE_TURNS);
    expect(list.findAllByType("article")[0]?.findAllByType("p")[0]?.props.children).toBe("Turn 4800.");

    const earlier = button(renderer, "Show 4800 earlier turns");
    expect(earlier).toBeTruthy();
    await act(async () => earlier!.props.onClick());
    expect(renderer.root.findByProps({ "aria-label": "Conversation transcript" }).findAllByType("article")).toHaveLength(5_000);
  });

  it("reads one bounded page rather than the whole thread on every beat", async () => {
    const api = commands();
    await act(async () => {
      create(<ConversationViewContent commands={api} projectId="project.one" />);
    });
    await act(async () => { await Promise.resolve(); });
    expect((api as any).detailCalls[0]).toEqual({ projectId: "project.one", conversationId: "conversation.1", limit: 100 });
    expect((api as any).detailCalls).toHaveLength(1);
  });
});
