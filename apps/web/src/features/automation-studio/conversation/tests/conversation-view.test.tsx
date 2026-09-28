import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/components/overlays/Modal", () => ({
  Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section>
}));

import { ConversationViewContent } from "../components";
import type { ConversationCommands } from "../conversation-host";
import { conversationThreadPage } from "../turn-queries";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const conversation = {
  conversationId: "conversation.1",
  projectId: "project.one",
  subject: { kind: "run", id: "run.7" },
  status: "open",
  // Core sends these too. They were fatal to the reader until a live run.
  title: "Nightly listings run",
  revision: 4,
  turnCount: 2,
  pendingAskCount: 0,
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
  const opened: Array<Record<string, unknown>> = [];
  const ran: Array<Record<string, unknown>> = [];
  const api: ConversationCommands & {
    detailCalls: typeof detailCalls;
    appended: typeof appended;
    answered: typeof answered;
    opened: typeof opened;
    ran: typeof ran;
  } = {
    detailCalls,
    appended,
    answered,
    opened,
    ran,
    listConversations: vi.fn(async () => script.listOk === false
      ? { ok: false, error: "The conversations could not be read." }
      : { ok: true, payload: { conversations: script.conversations ?? [conversation] } }) as any,
    loadConversation: vi.fn(async (payload: Record<string, unknown>) => {
      detailCalls.push(payload);
      if (script.detailOk === false) return { ok: false, error: "The conversation could not be read." };
      const turns = pages.length > 1 ? pages.shift()! : pages[0] ?? [];
      // Exactly the envelope Core answers with: the thread record wraps both
      // the conversation and its page of turns.
      return { ok: true, page: conversationThreadPage({ conversation, turns, hasMore: false }) };
    }) as any,
    // A person can start a thread themselves now, so the double answers with the
    // record Core answers with rather than an empty envelope the reader drops.
    startConversation: vi.fn(async (payload: Record<string, unknown>) => {
      opened.push(payload);
      return { ok: true, payload: { conversation } };
    }) as any,
    appendTurn: vi.fn(async (payload: Record<string, unknown>) => {
      appended.push(payload);
      return { ok: true, payload: {} };
    }) as any,
    answerAsk: vi.fn(async (payload: Record<string, unknown>) => {
      answered.push(payload);
      return { ok: true, payload: {} };
    }) as any,
    // The panel-operating half of the seam, and required rather than optional
    // on purpose: a surface mounted without a way to run a capability is a
    // surface a person cannot operate the panel from.
    runCapability: vi.fn(async (payload: Record<string, unknown>) => {
      ran.push(payload);
      return { capability: null, confidence: 0, arguments: {}, outcome: { status: "done", summary: "Done." } };
    }) as any,
    describeCapabilities: vi.fn(() => ({ prose: "I can do things in this panel.", vocabulary: [] })) as any
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

  it("teaches what the channel is when no thread exists yet", async () => {
    const renderer = await mount(commands({ conversations: [] }));
    const text = textOf(renderer);
    expect(text).toContain("This is where FluxIQ talks to you");
    expect(text).toContain("Permission before anything lasting");
    expect(text).toContain("A decision only you can make");
    expect(text).toContain("You can write here too.");
  });

  it("lists across every project when it is not standing in one", async () => {
    const api = commands();
    await mount(api, { projectId: null });
    expect(api.listConversations).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }));
  });

  it("names the open thread by Core's own title, with the subject underneath", async () => {
    const renderer = await mount(commands());
    const text = textOf(renderer);
    expect(text).toContain("Nightly listings run");
    expect(text).toContain("Run run.7");
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

  it("reads the thread from its start on open, and again from its start after a write", async () => {
    const api = commands({ pages: [[turn("turn.1", 10)], [turn("turn.1", 10), turn("turn.2", 20)]] });
    const renderer = await mount(api);
    expect((api as any).detailCalls[0]).toEqual({ projectId: "project.one", conversationId: "conversation.1", limit: 100 });

    await act(async () => renderer.root.findByProps({ "aria-label": "Message" }).props.onChange({ target: { value: "More, please." } }));
    await act(async () => {
      await renderer.root.findByProps({ "aria-label": "Write to FluxIQ" }).props.onSubmit({ preventDefault: () => undefined });
    });
    // No cursor after a write. A cursor read only brings turns newer than the
    // last one held, so an answer would settle an ask on the server and leave
    // its buttons on screen: the turn the ask hangs on is older than the
    // cursor and would never be read again.
    expect((api as any).detailCalls.at(-1)).not.toHaveProperty("sinceTurnId");
  });

  it("sends a reply and appends the answer to the same transcript", async () => {
    const api = commands({
      pages: [
        [turn("turn.1", 10)],
        [turn("turn.1", 10), turn("turn.2", 20, { author: "person", text: "Use the second filter." })]
      ]
    });
    const renderer = await mount(api);
    const composer = renderer.root.findByProps({ "aria-label": "Message" });
    await act(async () => composer.props.onChange({ target: { value: "  Use the second filter.  " } }));
    await act(async () => {
      await renderer.root.findByProps({ "aria-label": "Write to FluxIQ" }).props.onSubmit({ preventDefault: () => undefined });
    });

    expect((api as any).appended).toEqual([{ projectId: "project.one", conversationId: "conversation.1", text: "Use the second filter." }]);
    const text = textOf(renderer);
    expect(text).toContain("Said at 10.");
    expect(text).toContain("Use the second filter.");
    expect(renderer.root.findByProps({ "aria-label": "Message" }).props.value).toBe("");
  });

  it("names a read that keeps failing, and leaves the transcript standing", async () => {
    const api = commands({ pages: [[turn("turn.1", 10)]] });
    const renderer = await mount(api);
    expect(textOf(renderer)).toContain("Said at 10.");

    // One failure is a polling surface having a bad second; it says nothing.
    // Two in a row is a problem the person should know about.
    (api.loadConversation as any).mockImplementation(async () => ({ ok: false, error: "The conversation could not be read." }));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => renderer.root.findByProps({ "aria-label": "Message" }).props.onChange({ target: { value: `Again ${attempt}.` } }));
      await act(async () => {
        await renderer.root.findByProps({ "aria-label": "Write to FluxIQ" }).props.onSubmit({ preventDefault: () => undefined });
      });
    }
    const text = textOf(renderer);
    expect(text).toContain("The conversation could not be read.");
    expect(text).toContain("Said at 10.");
  });

  it("tells the person a question is waiting, and offers to take them to it", async () => {
    const renderer = await mount(commands({
      pages: [[turn("turn.1", 10, {
        ask: { askId: "ask.1", kind: "confirm", status: "pending", parks: true }
      })]]
    }));
    const text = textOf(renderer);
    expect(text).toContain("FluxIQ stopped here and is waiting on your answer.");
    expect(button(renderer, "Show me")).toBeTruthy();
  });

  it("takes text on a project that has said nothing yet, and starts the thread on send", async () => {
    // The composer was dead here until Core registered `open-conversation`:
    // there were no threads and nothing outside Core could open one, so the one
    // place the product asks people to talk to it could not be typed into.
    const api = commands({ conversations: [] });
    const renderer = await mount(api);
    const box = renderer.root.findByProps({ "aria-label": "Message" });
    expect(box.props.disabled).toBeFalsy();
    await act(async () => box.props.onChange({ target: { value: "Pull last month's invoices." } }));
    const form = renderer.root.findByProps({ "aria-label": "Write to FluxIQ" });
    await act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
    await act(async () => { await Promise.resolve(); });
    expect((api as any).opened).toEqual([{ projectId: "project.one" }]);
    expect((api as any).appended[0]).toMatchObject({ conversationId: "conversation.1", text: "Pull last month's invoices." });
  });

  it("says why the composer cannot be used rather than leaving a dead box", async () => {
    // The landing screen mounts the dock before a project is chosen. There is
    // no project to open a thread on, so this is the one state with genuinely
    // nowhere to send, and it says so.
    const renderer = await mount(commands({ conversations: [] }), { projectId: null });
    expect(renderer.root.findByProps({ "aria-label": "Message" }).props.disabled).toBe(true);
    expect(textOf(renderer)).toContain("Open a project to start a conversation.");
  });

  it("takes text the moment a thread exists, which is the whole point of a channel", async () => {
    const renderer = await mount(commands());
    const box = renderer.root.findByProps({ "aria-label": "Message" });
    expect(box.props.disabled).toBeFalsy();
    await act(async () => box.props.onChange({ target: { value: "Use the 30-day reading." } }));
    expect(renderer.root.findByProps({ "aria-label": "Message" }).props.value).toBe("Use the 30-day reading.");
    expect(button(renderer, "Send")?.props.disabled).toBeFalsy();
  });

  it("tells a collapsed shell how many threads are waiting on an answer", async () => {
    const waiting: number[] = [];
    await mount(commands({
      conversations: [conversation, { ...conversation, conversationId: "conversation.2", pendingAskCount: 1 }]
    }), { onWaitingChange: (count: number) => waiting.push(count) });
    expect(waiting.at(-1)).toBe(1);
  });
});
