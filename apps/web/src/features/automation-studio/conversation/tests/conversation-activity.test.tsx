// The chat's live activity: each step FluxIQ took as its own message with its
// reason, placed among the turns and kept after Core's snapshot moves on, the
// live line at the end while Core works, and the backoff that keeps reading.

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

function commands(activity: unknown[] | null, ...later: unknown[][]): ConversationCommands {
  const reads = [activity ?? [], ...later];
  let read = 0;
  const loadActivity = vi.fn(async () => {
    const recent = reads[Math.min(read++, reads.length - 1)]!;
    return { ok: true, snapshot: parseConversationActivitySnapshot({ current: recent.at(-1) ?? null, recent }) };
  });
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
    fire(name: string) {
      for (const listener of listeners.get(name) ?? []) listener();
    },
    addEventListener(name: string, listener: () => void) {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener));
    },
    removeEventListener(name: string, listener: () => void) {
      listeners.get(name)?.delete(listener);
    }
  };
}

let delays: number[] = [];
let page: ReturnType<typeof eventTarget> & { visibilityState: string };

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
    page = { visibilityState: "visible", ...eventTarget() };
    vi.stubGlobal("document", page);
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
    // A standalone action is its card: Core's name for the kind, what it acted on, how it went.
    expect(text).toContain("Open page");
    expect(text).toContain("Open the listing");
    expect(text).toContain("Done");
    for (const leak of ["core.run_node", "web.action", "Result:", "n3", "Status:"]) expect(text).not.toContain(leak);
  });

  it("shows each step as its own FluxIQ message with its reason, between the turns, with no fold", async () => {
    const build = { activityId: "build.3", subject: { kind: "build", id: "build.3", projectId: "project.one" }, step: undefined };
    const renderer = await mount(commands([
      event(1, { ...build, phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }),
      event(2, { ...build, phase: "exploring", label: "Clicking “Get a quote”", detail: { kind: "thought", title: "Clicking “Get a quote”", text: "The quote form is behind this button.", status: "succeeded" } }),
      event(3, { ...build, phase: "exploring", label: "Clicking “Get a quote” — done", detail: { kind: "tool", title: "Clicking “Get a quote”", status: "succeeded", ref: "core.run_node" } }),
      event(4, { ...build, label: "Putting the page back", detail: { kind: "note", title: "Putting the page back to where the Flow starts" } }),
      event(5, { ...build, phase: "done", label: "Finished", final: true, detail: undefined })
    ]));
    const items = renderer.root.findAllByType("li").filter((item) => item.props["data-turn-id"] || item.props["data-step-key"]);
    expect(items.map((item) => item.props["data-turn-id"] ?? item.props["data-step-key"])).toEqual(["turn.1", "step:build.3#2", "turn.2"]);
    const step = textOf(items[1]!.children);
    expect(step).toContain("Clicking “Get a quote”");
    expect(step).toContain("The quote form is behind this button.");
    expect(step).toContain("Done");
    const all = textOf(renderer.toJSON());
    for (const hidden of ["Putting the page back", "Deciding the next step", "steps", "Worked for"]) expect(all).not.toContain(hidden);
    expect(renderer.root.findAllByType("details")).toHaveLength(0);
    // Settled: no live line is left behind.
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
  });

  it("says how failed work ended as its own message", async () => {
    const renderer = await mount(commands([event(1), event(2, { phase: "failed", label: "The run stopped", final: true, detail: undefined })]));
    const steps = renderer.root.findAllByType("li").filter((item) => item.props["data-step-key"]);
    expect(steps.map((item) => textOf(item.children))).toEqual([expect.stringContaining("Open the listing"), expect.stringContaining("Run failed")]);
  });

  it("keeps every step of a long build after Core's snapshot has moved past them, each message in place", async () => {
    const build = { activityId: "build.9", subject: { kind: "build", id: "build.9", projectId: "project.one" }, step: undefined, phase: "exploring" };
    const decision = (sequence: number) => event(sequence, {
      ...build,
      label: `Clicking result ${sequence}`,
      detail: { kind: "thought", title: `Clicking result ${sequence}`, text: `Result ${sequence} matches the request.`, status: "succeeded" },
      at: new Date(1_790_000_001_000 + sequence * 100).toISOString()
    });
    const first = Array.from({ length: 60 }, (_, index) => decision(index + 1));
    const second = [...Array.from({ length: 59 }, (_, index) => decision(index + 62)), event(121, { ...build, phase: "done", label: "Finished", final: true, detail: undefined, at: new Date(1_790_000_019_000).toISOString() })];
    const renderer = await mount(commands(first, second));
    const stepItems = () => renderer.root.findAllByType("li").filter((item) => item.props["data-step-key"]);
    expect(stepItems()).toHaveLength(60);
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(1);
    const firstMessage = stepItems()[0]!.instance;
    await act(async () => { page.fire("visibilitychange"); });
    for (let flush = 0; flush < 5; flush += 1) await act(async () => { await Promise.resolve(); });
    const items = renderer.root.findAllByType("li").filter((item) => item.props["data-turn-id"] || item.props["data-step-key"]);
    expect(items).toHaveLength(121);
    expect(items[0]!.props["data-turn-id"]).toBe("turn.1");
    expect(items.at(-1)!.props["data-turn-id"]).toBe("turn.2");
    expect(textOf(items[1]!.children)).toContain("Result 1 matches the request.");
    // The first message is the same element it was before the second read.
    expect(stepItems()[0]!.instance).toBe(firstMessage);
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
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
    expect(renderer.root.findAllByType("li").filter((item) => item.props["data-step-key"])).toHaveLength(0);
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
      "../components/ConversationStepMessage.tsx",
      "../components/ConversationLiveLine.tsx",
      "../components/ConversationViewContent.tsx",
      "../components/ConversationThread.tsx"
    ]) {
      expect(source(path)).not.toContain("setInterval");
      expect(source(path)).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
    }
  });
});
