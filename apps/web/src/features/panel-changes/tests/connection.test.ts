import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelChangeConnection } from "../connection";
import type { PanelChangeEventStream, PanelChangeEventType, PanelChangeListener } from "../types";

class FakeStream implements PanelChangeEventStream {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private readonly listeners: Array<{ type: PanelChangeEventType; listener: (event: { data?: unknown }) => void }> = [];
  constructor(readonly url: string) {}
  addEventListener(type: PanelChangeEventType, listener: (event: { data?: unknown }) => void): void {
    this.listeners.push({ type, listener });
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  send(type: PanelChangeEventType, data: unknown): void {
    for (const entry of this.listeners) if (entry.type === type) entry.listener({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  drop(gaveUp = false): void {
    this.readyState = gaveUp ? 2 : 0;
    this.onerror?.(new Event("error"));
  }
}

function harness() {
  const streams: FakeStream[] = [];
  let wake: (() => void) | undefined;
  const connection = new PanelChangeConnection({
    openStream: (url) => {
      const stream = new FakeStream(url);
      streams.push(stream);
      return stream;
    },
    onWake: (listener) => {
      wake = listener;
      return () => {
        wake = undefined;
      };
    }
  });
  return { connection, streams, wake: () => wake?.() };
}

/** A reader that writes down everything it hears. */
function reader() {
  const heard: string[] = [];
  const listener: PanelChangeListener = {
    status: (status) => heard.push(`status:${status}`),
    opened: () => heard.push("opened"),
    gateway: () => heard.push("gateway"),
    conversation: (id) => heard.push(`conversation:${id}`),
    activity: (id) => heard.push(`activity:${id}`),
    modelAccess: () => heard.push("model-access")
  };
  return { heard, listener };
}

afterEach(() => vi.useRealTimers());

describe("PanelChangeConnection", () => {
  it("holds one stream for every reader on the page and tells each the thread or project to read again", () => {
    const { connection, streams } = harness();
    const pairing = reader();
    const chat = reader();
    const leavePairing = connection.subscribe({ gateway: pairing.listener.gateway! });
    const leaveChat = connection.subscribe(chat.listener);
    expect(streams).toHaveLength(1);
    expect(streams[0]!.url).toBe("/api/panel/changes");
    streams[0]!.open();
    streams[0]!.send("conversation", { conversationId: "conversation.one", version: 1 });
    streams[0]!.send("activity", { projectId: "project.a", version: 2 });
    streams[0]!.send("gateway", { version: 3 });
    expect(chat.heard).toEqual(["status:connecting", "status:live", "opened", "conversation:conversation.one", "activity:project.a", "gateway"]);
    leavePairing();
    expect(streams[0]!.closed).toBe(false);
    leaveChat();
    expect(streams[0]!.closed).toBe(true);
  });

  it("tells readers to read the AI key's state again on a model-access event, in the same stream, numbered with the others", () => {
    const { connection, streams } = harness();
    const keys = reader();
    connection.subscribe(keys.listener);
    streams[0]!.open();
    streams[0]!.send("gateway", { version: 1 });
    streams[0]!.send("model-access", { version: 2 });
    streams[0]!.send("model-access", { version: 4 });
    streams[0]!.send("model-access", "not json");
    expect(streams).toHaveLength(1);
    expect(keys.heard).toEqual(["status:connecting", "status:live", "opened", "gateway", "model-access", "opened", "opened"]);
  });

  it("tells a reader who joins an open stream to read once, since it has read nothing yet", () => {
    const { connection, streams } = harness();
    connection.subscribe({});
    streams[0]!.open();
    const late = reader();
    connection.subscribe(late.listener);
    expect(late.heard).toEqual(["status:live", "opened"]);
  });

  it("tells everyone to read once when the stream re-opens, and runs no timer while it is down", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "requestAnimationFrame"] });
    const { connection, streams } = harness();
    const chat = reader();
    connection.subscribe(chat.listener);
    streams[0]!.open();
    streams[0]!.send("conversation", { conversationId: "conversation.one", version: 1 });
    streams[0]!.drop();
    expect(vi.getTimerCount()).toBe(0);
    // The browser re-opens it by itself; the new stream numbers from 1 again.
    streams[0]!.open();
    streams[0]!.send("conversation", { conversationId: "conversation.two", version: 1 });
    expect(chat.heard.slice(4)).toEqual(["status:reconnecting", "status:live", "opened", "conversation:conversation.two"]);
  });

  it("tells everyone to read once when a number is skipped or an event cannot be read", () => {
    const { connection, streams } = harness();
    const chat = reader();
    connection.subscribe(chat.listener);
    streams[0]!.open();
    chat.heard.length = 0;
    streams[0]!.send("conversation", { conversationId: "conversation.one", version: 2 });
    streams[0]!.send("conversation", { conversationId: "conversation.two", version: 3 });
    streams[0]!.send("activity", "not json");
    streams[0]!.send("conversation", { version: 4 });
    expect(chat.heard).toEqual(["opened", "conversation:conversation.two", "opened", "opened"]);
  });

  it("re-opens a stream the browser gave up on when the tab is shown again, and leaves one it is re-opening to it", () => {
    const { connection, streams, wake } = harness();
    connection.subscribe({});
    streams[0]!.open();
    streams[0]!.drop(true);
    expect(connection.status()).toBe("closed");
    wake();
    expect(streams).toHaveLength(2);
    expect(connection.status()).toBe("connecting");
    streams[1]!.open();
    streams[1]!.drop();
    wake();
    connection.reopen();
    expect(streams).toHaveLength(2);
  });

  it("says closed, and opens nothing, where the browser has no EventSource", () => {
    const connection = new PanelChangeConnection({ openStream: () => undefined, onWake: () => () => undefined });
    const chat = reader();
    connection.subscribe(chat.listener);
    expect(chat.heard).toEqual(["status:closed"]);
  });
});
