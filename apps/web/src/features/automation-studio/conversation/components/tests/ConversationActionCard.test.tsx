// Every action FluxIQ takes is a card: Core's icon for its kind in a tinted
// mark, the kind's name and what it acted on, and the outcome in words. The
// card and its step message keep their elements while the action ends.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ACTIVITY_ACTION_ICONS, ACTIVITY_ACTION_NAMES, type ActivityActionKind } from "fluxiq/ui";
import { CONVERSATION_ACTION_ICONS, ConversationActionCard, ConversationStepMessage } from "..";
import { conversationStepMessages, type ConversationActivity, type ConversationStepAction, type ConversationStepMessage as StepMessage } from "../../activity";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const KINDS = Object.keys(ACTIVITY_ACTION_NAMES) as ActivityActionKind[];

function action(overrides: Partial<ConversationStepAction> = {}): ConversationStepAction {
  return { key: "action:build.1#3", kind: "click", target: "Get a free quote", outcome: "done", why: null, ...overrides };
}

function message(actions: ConversationStepAction[], overrides: Partial<StepMessage> = {}): StepMessage {
  return {
    key: "step:build.1#2",
    activityId: "build.1",
    kind: "decision",
    title: "Clicking “Get a free quote”",
    text: "The quote form is behind this button.",
    actions,
    atMs: 1_790_000_000_000,
    sequence: 3,
    latest: true,
    ...overrides
  };
}

describe("an action card", () => {
  it("has a lucide component for every kind Core names, drawing Core's icon", () => {
    expect(Object.keys(CONVERSATION_ACTION_ICONS).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      const markup = renderToStaticMarkup(<ConversationActionCard action={action({ kind })} live={false} />);
      expect(markup).toContain(`lucide-${ACTIVITY_ACTION_ICONS[kind]}`);
      expect(markup).toContain(`data-icon="${ACTIVITY_ACTION_ICONS[kind]}"`);
      expect(markup).toContain(`<strong>${ACTIVITY_ACTION_NAMES[kind]}</strong>`);
      expect(markup).toContain(`data-kind="${kind}"`);
      // The icon is decoration; the card's label says it all.
      expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/u);
      expect(markup).toContain(`aria-label="${ACTIVITY_ACTION_NAMES[kind]}: Get a free quote. ${kind === "test" || kind === "result_check" ? "Passed" : "Done"}"`);
    }
  });

  it("says what it acted on, or the page, and how it went in words and tone", () => {
    const failed = renderToStaticMarkup(<ConversationActionCard action={action({ outcome: "failed", why: "it wasn't on the page" })} live={false} />);
    expect(failed).toContain("tone-danger");
    expect(failed).toContain("Didn&#x27;t work: it wasn&#x27;t on the page");
    const waiting = renderToStaticMarkup(<ConversationActionCard action={action({ kind: "person_check", target: null, outcome: "waiting" })} live={false} />);
    expect(waiting).toContain("tone-warning");
    expect(waiting).toContain("<span>the page</span>");
    expect(waiting).toContain("Waiting for you");
    const working = renderToStaticMarkup(<ConversationActionCard action={action({ outcome: "working" })} live />);
    expect(working).toContain("tone-info");
    expect(working).toContain("Working on it");
    expect(working).toContain("automation-conversation-step-spinner");
    expect(renderToStaticMarkup(<ConversationActionCard action={action()} live={false} />)).toContain("tone-success");
    // A card whose work moved on without it ending says nothing about it.
    const stale = renderToStaticMarkup(<ConversationActionCard action={action({ outcome: "working" })} live={false} />);
    expect(stale).toContain("tone-neutral");
    expect(stale).not.toContain("Working on it");
  });

  it("never shows a dotted id or a result code from the events it was read from", () => {
    const at = (sequence: number) => new Date(1_790_000_000_000 + sequence * 1_000).toISOString();
    const base = { activityId: "build.1", subject: { kind: "build" as const, id: "build.1", projectId: "project.one" }, phase: "exploring" as const };
    const events: ConversationActivity[] = [
      { ...base, sequence: 1, label: "Clicking", detail: { kind: "thought", title: "Clicking “web.output.dom-click”", text: "It is the only button.", status: "succeeded" }, at: at(1), atMs: Date.parse(at(1)) },
      { ...base, sequence: 2, label: "Using core.run_node", detail: { kind: "tool", title: "Using core.run_node", status: "failed", ref: "core.run_node", text: "Result: web.target.not_found · Node: web.output.dom-click" }, at: at(2), atMs: Date.parse(at(2)) }
    ];
    const [step] = conversationStepMessages(events);
    const markup = renderToStaticMarkup(<>{step!.actions.map((card) => <ConversationActionCard action={card} key={card.key} live={false} />)}</>);
    expect(markup).toContain("Didn&#x27;t work: it wasn&#x27;t on the page");
    // The icon's own markup (its SVG namespace URL) is lucide's, not Core's words.
    expect(markup.replace(/<svg[\s\S]*?<\/svg>/gu, "")).not.toMatch(/[a-z_]+\.[a-z_]+/iu);
  });
});

describe("a step message with its cards", () => {
  it("keeps the message and its card as the same elements while the action goes from working to done", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ConversationStepMessage message={message([action({ outcome: "working" })])} working />);
    });
    const card = () => renderer.root.findByProps({ role: "group" });
    const before = card().instance ?? card();
    expect(card().props["aria-label"]).toBe("Click: Get a free quote. Working on it");
    act(() => {
      renderer.update(<ConversationStepMessage message={message([action({ outcome: "done" })], { sequence: 4 })} working />);
    });
    expect(card().instance ?? card()).toBe(before);
    expect(card().props["aria-label"]).toBe("Click: Get a free quote. Done");
    expect(renderer.root.findAllByProps({ role: "group" })).toHaveLength(1);
  });

  it("shows the reasoning above the card, and a run step or a standalone action as its card alone", () => {
    const decision = renderToStaticMarkup(<ConversationStepMessage message={message([action()])} working={false} />);
    expect(decision).toContain("<strong>Clicking “Get a free quote”</strong>");
    expect(decision.indexOf("automation-conversation-step-line")).toBeLessThan(decision.indexOf("automation-conversation-action"));
    const standalone = renderToStaticMarkup(<ConversationStepMessage message={message([action({ kind: "navigate", target: null })], { kind: "action", title: "Opened the listing page" })} working={false} />);
    expect(standalone).not.toContain("automation-conversation-step-line");
    expect(standalone).toContain("<strong>Open page</strong>");
    // A decision the model has not acted on yet is its reasoning alone.
    expect(renderToStaticMarkup(<ConversationStepMessage message={message([])} working />)).not.toContain("automation-conversation-action");
  });
});
