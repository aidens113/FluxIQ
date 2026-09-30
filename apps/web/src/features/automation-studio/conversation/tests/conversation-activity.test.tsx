// The chat's live activity: the status drawn in place under the turn, the
// steps folded between the turns, and the backoff that keeps reading while
// Core is working.

import React from "react";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/components/overlays/Modal", () => ({
  Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section>
}));

import { ConversationViewContent } from "../components";
import type { ConversationCommands } from "../conversation-host";
import { parseConversationActivitySnapshot } from "../activity";
import { conversationThreadPage } from "../turn-queries";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const conversation = {
  conversationId: "conversation.1",
  projectId: "project.one",
  subject: { kind: "run", id: "run.7" },
  status: "open",
  title: "Nightly listings run",
  pendingAskCount: 0,
  createdAt: 1_790_000_000_000,
  updatedAt: 1_790_000_000_500
};

const turns = [
  { turnId: "turn.1", conversationId: "conversation.1", author: "person", createdAt: 1_790_000_000_000, text: "Run the listings." },
  { turnId: "turn.2", conversationId: "conversation.1", author: "automation", createdAt: 1_790_000_020_000, text: "Started." }
];

function event(sequence: number, overrides: Record<string, unknown> = {}) {
  return {
    activityId: "run.7",
    sequence,
    subject: { kind: "run", id: "run.7", projectId: "project.one" },
    phase: "running",
    label: "Running step 2 of 5",
    step: { index: 2, count: 5, nodeId: "node.open", label: "Open the listing" },
    detail: { kind: "tool", title: "Opened the listing page", status: "succeeded", ref: "tool.navigate", text: "Reached the listing." },
    conversationId: "conversation.1",
    at: new Date(1_790_000_010_000).toISOString(),
    ...overrides
  };
}

function commands(activity: unknown[] | null): ConversationCommands {
  const loadActivity = vi.fn(async () => ({ ok: true, snapshot: parseConversationActivitySnapshot({ current: activity?.at(-1) ?? null, recent: activity ?? [] }) }));
  return {
    listConversations: vi.fn(async () => ({ ok: true, payload: { conversations: [conversation] } })) as any,
    loadConversation: vi.fn(async () => ({ ok: true, page: conversationThreadPage({ conversation, turns, hasMore: false }) })) as any,
    startConversation: vi.fn(async () => ({ ok: true, payload: { conversation } })) as any,
    appendTurn: vi.fn(async () => ({ ok: true, payload: {} })) as any,
    sendInstruction: vi.fn(async () => ({ ok: true, problem: null, decision: { kind: "reply" }, dispatch: null })) as any,
    answerAsk: vi.fn(async () => ({ ok: true, payload: {} })) as any,
    runCapability: vi.fn(async () => ({ capability: null, confidence: 0, arguments: {}, outcome: { status: "done", summary: "Done." } })) as any,
    describeCapabilities: vi.fn(() => ({ prose: "", vocabulary: [] })) as any,
    ...(activity ? { loadActivity: loadActivity as any } : {})
  };
}

function eventTarget() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener(name: string, listener: () => void) {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener));
    },
    removeEventListener(name: string, listener: () => void) {
      listeners.get(name)?.delete(listener);
    }
  };
}

let delays: number[] = [];

async function mount(api: ConversationCommands) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ConversationViewContent commands={api} projectId="project.one" />);
  });
  for (let flush = 0; flush < 5; flush += 1) await act(async () => { await Promise.resolve(); });
  return renderer;
}

function textOf(node: any): string {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return textOf(node.children);
}

describe("the chat's live activity", () => {
  beforeEach(() => {
    delays = [];
    vi.stubGlobal("document", { visibilityState: "visible", ...eventTarget() });
    vi.stubGlobal("window", {
      ...eventTarget(),
      // Recorded, never fired: the cases read which beat each poll chose.
      setTimeout: (_callback: () => void, delayMs: number) => delays.push(delayMs),
      clearTimeout: () => undefined
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("draws Core's work in place under the turn that asked for it, read for the project on screen", async () => {
    const api = commands([event(1)]);
    const renderer = await mount(api);
    expect(api.loadActivity).toHaveBeenCalledWith({ projectId: "project.one" });
    const transcript = renderer.root.findByProps({ "aria-label": "Conversation transcript" });
    const status = transcript.findByProps({ role: "status" });
    const text = textOf(status.children);
    expect(text).toContain("Running your Flow");
    expect(text).toContain("Running step 2 of 5");
    // One status, in the stream: no banner over the transcript as well.
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(1);
  });

  it("says what Core did in words, never a tool id, a node id or a result code", async () => {
    const raw = event(1, {
      label: "Using core.run_node: web.action.succeeded",
      detail: { kind: "tool", title: "core.run_node", status: "succeeded", ref: "core.run_node", text: "Result: web.action.succeeded · Node: n3" }
    });
    const renderer = await mount(commands([raw]));
    const text = textOf(renderer.toJSON());
    expect(text).toContain("Working on the page");
    for (const leak of ["core.run_node", "web.action", "Result:", "n3", "Status:"]) expect(text).not.toContain(leak);
  });

  it("folds the rows between two turns into one quiet group and hides Core's bookkeeping", async () => {
    const renderer = await mount(commands([
      event(1),
      event(2, { label: "Clicking “Get a quote” — done", detail: { kind: "tool", title: "Clicking “Get a quote”", status: "succeeded" }, at: new Date(1_790_000_015_000).toISOString() }),
      event(3, { label: "Putting the page back", detail: { kind: "note", title: "Putting the page back to where the Flow starts" } }),
      event(4, { phase: "done", label: "Finished", final: true, detail: undefined })
    ]));
    const items = renderer.root.findAllByType("li").filter((item) => item.props["data-turn-id"] || item.props["data-activity-group"]);
    expect(items.map((item) => item.props["data-turn-id"] ?? "activity")).toEqual(["turn.1", "activity", "turn.2"]);
    const fold = renderer.root.findByType("details");
    expect(textOf(fold.findByType("summary").children)).toBe("Worked for 5s · 2 steps");
    const steps = textOf(fold.findByType("ol").children);
    expect(steps).toContain("Running step 2 of 5");
    expect(steps).toContain("Clicking “Get a quote”");
    expect(textOf(renderer.toJSON())).not.toContain("Putting the page back");
    // Settled: the fold says how it went, and no live status is left behind.
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
  });

  it("leads a failed group with how it ended", async () => {
    const renderer = await mount(commands([event(1), event(2, { phase: "failed", label: "The run stopped", final: true, detail: undefined })]));
    expect(textOf(renderer.root.findByType("summary").children)).toBe("Run failed · 1 step");
  });

  it("keeps the status for its own thread", async () => {
    const renderer = await mount(commands([event(1, { conversationId: "conversation.other", detail: undefined })]));
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
  });

  it("reads again on the fast beat while Core's latest event is not its last", async () => {
    await mount(commands([event(1)]));
    expect(delays).toContain(1_000);
  });

  it("drops to the ordinary cadence once Core's latest event is final", async () => {
    await mount(commands([event(1), event(2, { phase: "done", label: "Finished", final: true, detail: undefined })]));
    expect(delays).not.toContain(1_000);
  });

  it("shows no status and no steps where the surface cannot read activity", async () => {
    const renderer = await mount(commands(null));
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
    expect(renderer.root.findAllByType("details")).toHaveLength(0);
  });
});

describe("the activity reader stays on the backoff poller", () => {
  it("has no fixed interval anywhere in the view or its reader", () => {
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    const reader = source("../activity/useConversationActivity.ts");
    expect(reader).toContain("createBackoffPoller");
    expect(reader).toContain('document.addEventListener("visibilitychange"');
    for (const path of [
      "../activity/useConversationActivity.ts",
      "../activity/usePacedConversationActivity.ts",
      "../activity/pacer.ts",
      "../components/ConversationActivityBlock.tsx",
      "../components/ConversationViewContent.tsx",
      "../components/ConversationThread.tsx"
    ]) {
      expect(source(path)).not.toContain("setInterval");
      expect(source(path)).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
    }
  });
});
