import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/components/overlays/Modal", () => ({
  Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section>
}));

import { ConversationViewContent } from "../components";
import type { ConversationCommands } from "../conversation-host";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const conversation = {
  conversationId: "conversation.1",
  projectId: "project.one",
  subject: { kind: "run", id: "run.7" },
  status: "open",
  createdAt: 1_790_000_000_000,
  updatedAt: 1_790_000_000_500
};

function turn(turnId: string, createdAt: number, overrides: Record<string, unknown> = {}) {
  return {
    turnId,
    conversationId: "conversation.1",
    author: "automation",
    createdAt,
    text: `Said at ${createdAt}.`,
    ...overrides
  };
}

type Script = {
  conversations?: unknown[];
  listOk?: boolean;
  pages?: unknown[][];
  detailOk?: boolean;
};

function commands(script: Script = {}) {
  const pages = script.pages ? [...script.pages] : [[turn("turn.1", 10), turn("turn.2", 20)]];
  const detailCalls: Array<Record<string, unknown>> = [];
  const appended: Array<Record<string, unknown>> = [];
  const answered: Array<Record<string, unknown>> = [];
  const api: ConversationCommands & { detailCalls: typeof detailCalls; appended: typeof appended; answered: typeof answered } = {
    detailCalls,
    appended,
    answered,
    listConversations: vi.fn(async () => script.listOk === false
      ? { ok: false, error: "The conversations could not be read." }
      : { ok: true, payload: { conversations: script.conversations ?? [conversation] } }) as any,
    loadConversation: vi.fn(async (payload: Record<string, unknown>) => {
      detailCalls.push(payload);
      if (script.detailOk === false) return { ok: false, error: "The conversation could not be read." };
      const turns = pages.length > 1 ? pages.shift()! : pages[0] ?? [];
      return { ok: true, payload: { conversation, turns } };
    }) as any,
    appendTurn: vi.fn(async (payload: Record<string, unknown>) => {
      appended.push(payload);
      return { ok: true, payload: {} };
    }) as any,
    answerAsk: vi.fn(async (payload: Record<string, unknown>) => {
      answered.push(payload);
      return { ok: true, payload: {} };
    }) as any
  };
  return api;
}

async function mount(api: ConversationCommands, props: Record<string, unknown> = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ConversationViewContent commands={api} projectId="project.one" {...props} />);
  });
  await act(async () => { await Promise.resolve(); });
  return renderer;
}

function textOf(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: any) => {
    if (node === null || node === undefined || node === false) return;
    if (typeof node === "string" || typeof node === "number") {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    walk(node.children);
  };
  walk(renderer.toJSON());
  return parts.join(" ");
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByType("button").find((candidate) =>
    candidate.findAll((node) => node.children.some((child) => child === label), { deep: true }).length > 0
    || candidate.props.children === label
  );
}

describe("ConversationViewContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says nothing has been said yet, and invites the person to write first", async () => {
    const renderer = await mount(commands({ pages: [[]] }));
    expect(textOf(renderer)).toContain("Nothing said yet");
    expect(textOf(renderer)).toContain("You can write first.");
  });

  it("asks for a project before it asks for anything else", async () => {
    const renderer = await mount(commands(), { projectId: null });
    expect(textOf(renderer)).toContain("Open a project to see its conversations.");
  });

  it("shows an ordered transcript with each turn's author and time", async () => {
    const renderer = await mount(commands({ pages: [[turn("turn.2", 20), turn("turn.1", 10, { author: "person", text: "Filter by price." })]] }));
    const list = renderer.root.findByProps({ "aria-label": "Conversation transcript" });
    expect(list.props["aria-live"]).toBe("polite");
    const items = list.findAllByType("article");
    expect(items).toHaveLength(2);
    expect(textOf(renderer).indexOf("Filter by price.")).toBeLessThan(textOf(renderer).indexOf("Said at 20."));
    expect(textOf(renderer)).toContain("You");
    expect(textOf(renderer)).toContain("FluxIQ");
    expect(list.findAllByType("time")).toHaveLength(2);
  });

  it("reads the thread from its start on open, then by cursor", async () => {
    const api = commands({ pages: [[turn("turn.1", 10)], [turn("turn.2", 20)]] });
    const renderer = await mount(api);
    expect((api as any).detailCalls[0]).toEqual({ conversationId: "conversation.1", limit: 100 });

    await act(async () => renderer.root.findByProps({ "aria-label": "Message" }).props.onChange({ target: { value: "More, please." } }));
    await act(async () => {
      await renderer.root.findByProps({ "aria-label": "Write to FluxIQ" }).props.onSubmit({ preventDefault: () => undefined });
    });
    expect((api as any).detailCalls.at(-1)).toMatchObject({ sinceTurnId: "turn.1" });
  });

  it("sends a reply and appends the answer to the same transcript", async () => {
    const api = commands({ pages: [[turn("turn.1", 10)], [turn("turn.2", 20, { author: "person", text: "Use the second filter." })]] });
    const renderer = await mount(api);
    const composer = renderer.root.findByProps({ "aria-label": "Message" });
    await act(async () => composer.props.onChange({ target: { value: "  Use the second filter.  " } }));
    await act(async () => {
      await renderer.root.findByProps({ "aria-label": "Write to FluxIQ" }).props.onSubmit({ preventDefault: () => undefined });
    });

    expect((api as any).appended).toEqual([{ conversationId: "conversation.1", text: "Use the second filter." }]);
    const text = textOf(renderer);
    expect(text).toContain("Said at 10.");
    expect(text).toContain("Use the second filter.");
    expect(renderer.root.findByProps({ "aria-label": "Message" }).props.value).toBe("");
  });

  it("names a failed read and leaves the transcript standing", async () => {
    const api = commands({ pages: [[turn("turn.1", 10)]] });
    const renderer = await mount(api);
    expect(textOf(renderer)).toContain("Said at 10.");

    (api.loadConversation as any).mockImplementation(async () => ({ ok: false, error: "The conversation could not be read." }));
    await act(async () => renderer.root.findByProps({ "aria-label": "Message" }).props.onChange({ target: { value: "Again." } }));
    await act(async () => {
      await renderer.root.findByProps({ "aria-label": "Write to FluxIQ" }).props.onSubmit({ preventDefault: () => undefined });
    });
    const text = textOf(renderer);
    expect(text).toContain("The conversation could not be read.");
    expect(text).toContain("Said at 10.");
  });

  it("tells the person a question is waiting on them", async () => {
    const renderer = await mount(commands({
      pages: [[turn("turn.1", 10, {
        ask: { askId: "ask.1", kind: "confirm", status: "pending", parks: true }
      })]]
    }));
    expect(textOf(renderer)).toContain("FluxIQ is waiting on an answer in this conversation.");
  });

  it("disables the composer until a conversation exists", async () => {
    const renderer = await mount(commands({ conversations: [] }));
    expect(renderer.root.findByProps({ "aria-label": "Message" }).props.disabled).toBe(true);
    expect(button(renderer, "Send")?.props.disabled).toBe(true);
  });
});
