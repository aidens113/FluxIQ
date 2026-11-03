import type { ChatActivityState, ChatResult, ChatSend, ChatTransport } from "@fluxiq/ui-components";
import { FakeElement, withFakeDocument } from "@fluxiq/ui-components/testing";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ChatWidget } from "../ChatWidget";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION = { conversationId: "conv-1", projectId: "p1", revision: 1, status: "open", subjectKind: "project", subjectId: "p1" };
const TURN = { turnId: "t1", author: "person", text: "Find cheap lamps", attachment: null, ask: null };
const IDLE: ChatActivityState = { current: null, display: null, recent: [], overlay: "hidden", live: true };

type Counts = {
  sent: ChatSend[];
  listed: Array<Parameters<ChatTransport["conversation"]["listThreads"]>[0]>;
  reads: number;
  subscribed: number;
  unsubscribed: number;
  activityReads: number;
};

type Spy = Counts & { transport: ChatTransport };

function spyTransport(): Spy {
  const spy: Counts = { sent: [], listed: [], reads: 0, subscribed: 0, unsubscribed: 0, activityReads: 0 };
  const ok = <T,>(value: T): ChatResult<T> => ({ ok: true, value });
  const transport: ChatTransport = {
    conversation: {
      listThreads: async (query) => {
        spy.listed.push(query);
        return ok({ conversations: [CONVERSATION] });
      },
      readThread: async () => {
        spy.reads += 1;
        return ok({ conversation: { conversation: CONVERSATION, turns: [TURN], hasMore: false } });
      },
      send: async (message) => {
        spy.sent.push(message);
        return ok({});
      },
      answer: async () => ok({})
    },
    activity: {
      read: async () => {
        spy.activityReads += 1;
        return ok({ state: IDLE });
      },
      subscribe: () => {
        spy.subscribed += 1;
        return () => void (spy.unsubscribed += 1);
      }
    },
    runs: { stop: async () => ok({}), takeOver: async () => ok({}), handBack: async () => ok({}) }
  };
  return Object.assign(spy, { transport });
}

const settle = async () => {
  for (let turn = 0; turn < 6; turn += 1) await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
};

async function mount(host: FakeElement, spy: Spy, projectId = "p1"): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ChatWidget transport={spy.transport} projectId={projectId} />, { createNodeMock: () => host });
  });
  return renderer;
}

const messages = (host: FakeElement) => host.byClass("chat-msg").map((message) => message.textContent);

describe("the mounted chat widget", () => {
  it("places the real widget in its host, reads the project's thread and shows a turn", async () => {
    await withFakeDocument(async () => {
      const host = new FakeElement("div");
      const spy = spyTransport();
      const renderer = await mount(host, spy);
      await settle();
      expect(host.children).toHaveLength(1);
      expect(host.children[0]!.className).toContain("chat-panel");
      expect(spy.listed[0]).toMatchObject({ subjectKind: "project", status: "open" });
      expect(spy.reads).toBeGreaterThan(0);
      expect(messages(host)).toEqual(["Find cheap lamps"]);
      expect(spy.subscribed).toBeGreaterThan(0);
      await act(async () => renderer.unmount());
    });
  });

  it("sends what a person types through the transport, into the thread on screen", async () => {
    await withFakeDocument(async () => {
      const host = new FakeElement("div");
      const spy = spyTransport();
      const renderer = await mount(host, spy);
      await settle();
      const box = host.descendants().find((element) => element.id === "conversationInput")!;
      box.value = "Run it now";
      box.dispatch("input");
      await act(async () => box.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => undefined }));
      await settle();
      expect(spy.sent).toHaveLength(1);
      expect(spy.sent[0]).toMatchObject({ text: "Run it now", conversationId: "conv-1", projectId: "p1" });
      await act(async () => renderer.unmount());
    });
  });

  it("stops reading and removes the widget when it unmounts", async () => {
    await withFakeDocument(async () => {
      const host = new FakeElement("div");
      const spy = spyTransport();
      const renderer = await mount(host, spy);
      await settle();
      const readsBefore = spy.reads;
      await act(async () => renderer.unmount());
      expect(host.children).toHaveLength(0);
      expect(spy.unsubscribed).toBeGreaterThanOrEqual(spy.subscribed);
      await settle();
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(spy.reads).toBe(readsBefore);
    });
  });

  it("is a new owner when the project changes, and never creates a second widget", async () => {
    await withFakeDocument(async () => {
      const host = new FakeElement("div");
      const spy = spyTransport();
      const renderer = await mount(host, spy);
      await settle();
      const listedBefore = spy.listed.length;
      const widgetBefore = host.children[0];
      await act(async () => renderer.update(<ChatWidget transport={spy.transport} projectId="p2" />));
      await settle();
      expect(host.children).toHaveLength(1);
      expect(host.children[0]).toBe(widgetBefore);
      expect(spy.listed.length).toBeGreaterThan(listedBefore);
      await act(async () => renderer.unmount());
    });
  });
});
