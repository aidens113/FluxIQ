// The mounted chat's run controls and followed runs, end to end under a fake
// DOM: Take over beside Stop while a run works, the held sentence with Hand
// back and Stop, and a run the shell follows here opening a thread that shows
// its steps, but not while the person types a message or records.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { createChatWidget, type ChatWidget } from "../../chat-widget.ts";
import { targetCore, type TargetCore } from "../../conversation/tests/target-core.ts";
import type { ChatTarget } from "../../target.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { hostStatus } from "../../tests/host-status.ts";
import { messageTransport, TEST_ACTIVITY_MESSAGES, TEST_MESSAGES, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatActivityState, ChatResult } from "../../ports/index.ts";

const CONNECTED = hostStatus({ connected: true });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const OTHER: ChatTarget = { kind: "automation", flowId: "flow-7", name: "Price tracker" };

function run(sequence: number, fields: Partial<ClientGatewayActivity> = {}): ClientGatewayActivity {
  return { activityId: "run:r1", sequence, subject: { kind: "run", id: "r1", projectId: "project-1", flowId: "flow-8" }, phase: "running",
    label: "Running step 1 of 4", at: new Date(Date.UTC(2026, 9, 8, 4, 0, sequence)).toISOString(), ...fields };
}

type Harness = { chat: ChatWidget; core: TargetCore; push(event: ClientGatewayActivity): void; close(): void };

/** A chat over `core` whose activity relay answers with the events pushed so far. */
async function harness(core: TargetCore, first: ClientGatewayActivity | null, setup: (chat: ChatWidget) => void = () => undefined): Promise<Harness> {
  let state: ChatActivityState = { current: first, display: null, recent: first ? [first] : [], history: first ? [first] : [], overlay: "expanded", live: true };
  const listeners: Array<(message: unknown) => void> = [];
  const request = async (message: TestMessage): Promise<ChatResult<unknown>> => {
    if (message.type === TEST_ACTIVITY_MESSAGES.read) return { ok: true, value: { ok: true, state } };
    if (message.type === TEST_MESSAGES.panelTakeOverRun || message.type === TEST_MESSAGES.panelHandBackRun || message.type === TEST_MESSAGES.panelStopRun) {
      core.sent.push(message);
      return { ok: true, value: { ok: true, payload: {} } };
    }
    return core.request(message);
  };
  const transport = messageTransport(request, {
    listen: (listener) => {
      listeners.push(listener);
      return () => undefined;
    }
  });
  const chat = createChatWidget(transport, { openControl: () => ({ element: document.createElement("a"), observe: () => undefined }) });
  chat.render(CONNECTED);
  setup(chat);
  chat.setActive(true);
  await settle();
  return {
    chat,
    core,
    push(event) {
      state = { ...state, current: event, recent: [...state.recent, event], history: [...(state.history ?? []), event] };
      for (const listener of listeners) listener({ type: TEST_ACTIVITY_MESSAGES.changed, state });
    },
    close() {
      chat.setActive(false);
    }
  };
}

function latestCore(): TargetCore {
  return targetCore([
    { conversationId: "conv-flow-7", subjectKind: "flow", subjectId: "flow-7", turns: [{ turnId: "f1", author: "automation", text: "Price tracker is ready." }] },
    { conversationId: "conv-flow-8", subjectKind: "flow", subjectId: "flow-8", turns: [{ turnId: "g1", author: "automation", text: "Lamp finder is ready." }] },
    { conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "l1", author: "person", text: "Find cheap lamps" }] }
  ]);
}

test("a working run offers Take over beside Stop; held, the chat says whose page it is with Hand back and Stop", async () => {
  await withFakeDocument(async () => {
    const h = await harness(latestCore(), run(1));
    try {
      const root = fake(h.chat.element);
      const dock = root.byClass("chat-dock")[0]!;
      const take = dock.byClass("chat-hold")[0]!;
      assert.equal(dock.byClass("chat-hold-control")[0]!.hidden, false);
      assert.equal(take.textContent, "Take over");
      assert.equal(dock.byClass("chat-stop-control")[0]!.hidden, false);
      assert.equal(dock.byClass("chat-stop")[0]!.textContent, "Stop");
      assert.equal(dock.byClass("chat-stop")[0]!.getAttribute("aria-label"), "Stop run");

      take.dispatch("click");
      await settle();
      assert.deepEqual(h.core.sent.filter((message) => message.type === TEST_MESSAGES.panelTakeOverRun), [{ type: TEST_MESSAGES.panelTakeOverRun, projectId: "project-1", runId: "r1" }]);
      assert.equal(take.textContent, "Taking over…");

      h.push(run(2, { phase: "paused", label: "Paused: you have the page", step: { index: 2, count: 4 } }));
      assert.equal(dock.byClass("chat-hold-sentence")[0]!.textContent, "You have the page. FluxIQ continues from step 2 when you hand back.");
      assert.equal(take.textContent, "Hand back");
      assert.equal(dock.byClass("chat-stop-control")[0]!.hidden, false, "Stop stays while the run is held");
      take.dispatch("click");
      await settle();
      assert.deepEqual(h.core.sent.filter((message) => message.type === TEST_MESSAGES.panelHandBackRun).at(-1), { type: TEST_MESSAGES.panelHandBackRun, projectId: "project-1", runId: "r1" });

      h.push(run(3, { phase: "done", label: "Run finished", final: true }));
      assert.equal(dock.byClass("chat-hold-control")[0]!.hidden, true);
    } finally { h.close(); }
  });
});

test("a build never offers Take over", async () => {
  await withFakeDocument(async () => {
    const build = { ...run(1), activityId: "build:b1", subject: { kind: "build" as const, id: "b1", projectId: "project-1", flowId: "flow-8" }, phase: "building" as const };
    const h = await harness(latestCore(), build);
    try {
      const dock = fake(h.chat.element).byClass("chat-dock")[0]!;
      assert.equal(dock.byClass("chat-hold-control")[0]!.hidden, true);
      assert.equal(dock.byClass("chat-stop-control")[0]!.hidden, false);
    } finally { h.close(); }
  });
});

test("a followed run opens its automation's chat when the chat on screen would not show it", async () => {
  await withFakeDocument(async () => {
    const h = await harness(latestCore(), null, (chat) => {
      chat.open({ kind: "automation", flowId: "flow-8", name: "Lamp finder" });
      chat.open(OTHER);
    });
    try {
      assert.equal(h.chat.target().kind, "automation");
      h.push(run(1));
      h.chat.followRun(run(1));
      await settle();
      assert.deepEqual(h.chat.target(), { kind: "automation", flowId: "flow-8", name: "Lamp finder" });
    } finally { h.close(); }
  });
});

test("without the Flow's name a followed run opens the latest chat; a chat that shows it is kept", async () => {
  await withFakeDocument(async () => {
    const h = await harness(latestCore(), null, (chat) => chat.open(OTHER));
    try {
      h.push(run(1));
      h.chat.followRun(run(1));
      await settle();
      assert.deepEqual(h.chat.target(), { kind: "latest" });
      h.chat.followRun(run(2));
      assert.deepEqual(h.chat.target(), { kind: "latest" }, "the latest chat shows the run already");
    } finally { h.close(); }
  });
});

test("a run started from another thread opens its own thread unless that thread is known", async () => {
  await withFakeDocument(async () => {
    const spoken = run(1, { conversationId: "conv-elsewhere" });
    const h = await harness(latestCore(), null, (chat) => chat.open(OTHER));
    try {
      h.push(spoken);
      h.chat.followRun(spoken);
      await settle();
      assert.deepEqual(h.chat.target(), { kind: "question", activityId: "run:r1", subjectKind: "run", subjectId: "r1", title: "This run" });
    } finally { h.close(); }
  });
  await withFakeDocument(async () => {
    const spoken = run(1, { conversationId: "conv-latest" });
    const h = await harness(latestCore(), null);
    try {
      h.chat.open(OTHER);
      await settle();
      h.push(spoken);
      h.chat.followRun(spoken);
      await settle();
      assert.deepEqual(h.chat.target(), { kind: "latest" }, "the latest chat was read as conv-latest, the run's thread");
    } finally { h.close(); }
  });
});

test("a followed run waits while the person types a message, and never moves a recording", async () => {
  await withFakeDocument(async () => {
    const h = await harness(latestCore(), null, (chat) => chat.open(OTHER));
    try {
      const box = fake(h.chat.element).querySelectorAll("textarea")[0]!;
      box.value = "half a thought";
      (document as unknown as { activeElement: unknown }).activeElement = box;
      h.push(run(1));
      h.chat.followRun(run(1));
      await settle();
      assert.equal(h.chat.target().kind, "automation", "kept while the person types");
      (document as unknown as { activeElement: unknown }).activeElement = null;
      h.push(run(2));
      await settle();
      assert.deepEqual(h.chat.target(), { kind: "latest" }, "opened once they stop");
      assert.equal(box.value, "half a thought", "the draft is kept");
    } finally { h.close(); }
  });
  await withFakeDocument(async () => {
    const h = await harness(latestCore(), null, (chat) => chat.open(OTHER));
    try {
      h.chat.render(hostStatus({ connected: true, recording: true }));
      h.push(run(1));
      h.chat.followRun(run(1));
      h.push(run(2));
      await settle();
      assert.equal(h.chat.target().kind, "automation");
    } finally { h.close(); }
  });
});
