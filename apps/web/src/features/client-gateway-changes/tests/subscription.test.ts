import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayChangeSubscription } from "../subscription";
import type { GatewayChangeSources, GatewayChangeStream } from "../types";

class FakeStream implements GatewayChangeStream {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private readonly changeListeners: Array<() => void> = [];
  constructor(readonly url: string) {}
  addEventListener(_type: "change", listener: () => void): void {
    this.changeListeners.push(listener);
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  change(): void {
    for (const listener of this.changeListeners) listener();
  }
  /** The connection dropped: the browser re-opens it by itself (`CONNECTING`), or gave up (`CLOSED`). */
  drop(gaveUp = false): void {
    this.readyState = gaveUp ? 2 : 0;
    this.onerror?.(new Event("error"));
  }
}

function harness(options: { eventSource?: boolean } = {}) {
  const streams: FakeStream[] = [];
  const reads: Array<{ resolve: (result: { ok: boolean; status: number; body: unknown }) => void }> = [];
  let wake: (() => void) | undefined;
  const sources: GatewayChangeSources = {
    openStream: (url) => {
      if (options.eventSource === false) return undefined;
      const stream = new FakeStream(url);
      streams.push(stream);
      return stream;
    },
    readSnapshot: () => new Promise((resolve) => reads.push({ resolve })),
    onWake: (listener) => {
      wake = listener;
      return () => {
        wake = undefined;
      };
    }
  };
  const subscription = new GatewayChangeSubscription(sources);
  const answer = async (index: number, payload: Record<string, unknown> | null, status = 200) => {
    reads[index]!.resolve({ ok: status === 200, status, body: payload ? { ok: true, payload } : { ok: false, error: "refused" } });
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { subscription, streams, reads, answer, wake: () => wake?.() };
}

afterEach(() => vi.useRealTimers());

describe("GatewayChangeSubscription", () => {
  it("holds one stream for every reader, opens it with the first and closes it with the last", () => {
    const { subscription, streams } = harness();
    const leaveA = subscription.subscribe(() => undefined);
    const leaveB = subscription.subscribe(() => undefined);
    expect(streams).toHaveLength(1);
    expect(streams[0]!.url).toBe("/api/client-gateway/changes");
    leaveA();
    expect(streams[0]!.closed).toBe(false);
    leaveB();
    expect(streams[0]!.closed).toBe(true);
    expect(subscription.getState()).toMatchObject({ status: "connecting", snapshot: undefined, revision: 0 });
  });

  it("reads the snapshot once when the stream opens and once more each time it re-opens", async () => {
    const { subscription, streams, reads, answer } = harness();
    subscription.subscribe(() => undefined);
    expect(reads).toHaveLength(0);
    streams[0]!.open();
    expect(reads).toHaveLength(1);
    await answer(0, { pairings: [{ pairingCode: "1" }] });
    expect(subscription.getState()).toMatchObject({ status: "live", snapshot: { pairings: [{ pairingCode: "1" }] }, revision: 1 });

    streams[0]!.drop();
    expect(subscription.getState().status).toBe("reconnecting");
    // A drop is not a reason to read: what changed while it was down is read when it re-opens.
    expect(reads).toHaveLength(1);
    streams[0]!.open();
    expect(reads).toHaveLength(2);
    await answer(1, { pairings: [] });
    expect(subscription.getState()).toMatchObject({ status: "live", snapshot: { pairings: [] }, revision: 2 });
  });

  it("reads once per change, and serves changes that arrive during a read with one more read", async () => {
    const { subscription, streams, reads, answer } = harness();
    const heard = vi.fn();
    subscription.subscribe(heard);
    streams[0]!.open();
    await answer(0, { version: 1 });
    streams[0]!.change();
    expect(reads).toHaveLength(2);
    streams[0]!.change();
    streams[0]!.change();
    expect(reads).toHaveLength(2);
    await answer(1, { version: 2 });
    expect(reads).toHaveLength(3);
    await answer(2, { version: 4 });
    expect(reads).toHaveLength(3);
    expect(subscription.getState()).toMatchObject({ snapshot: { version: 4 }, revision: 4 });
    expect(heard).toHaveBeenCalled();
  });

  it("runs no timer of its own: while the stream is down it says so and reads nothing more", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "requestAnimationFrame"] });
    const { subscription, streams, reads, answer } = harness();
    subscription.subscribe(() => undefined);
    streams[0]!.open();
    await answer(0, { pairings: [] });
    streams[0]!.drop(true);
    expect(subscription.getState().status).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * 60_000);
    expect(reads).toHaveLength(1);
  });

  it("re-opens a stream the browser gave up on when the tab is shown again, and reads on that open", async () => {
    const { subscription, streams, reads, answer, wake } = harness();
    subscription.subscribe(() => undefined);
    streams[0]!.open();
    await answer(0, { pairings: [] });
    streams[0]!.drop(true);
    wake();
    expect(streams).toHaveLength(2);
    expect(subscription.getState().status).toBe("connecting");
    streams[1]!.open();
    expect(reads).toHaveLength(2);
    // A stream the browser is still re-opening by itself is left to it.
    streams[1]!.drop();
    wake();
    expect(streams).toHaveLength(2);
  });

  it("reads once so the page shows what there is when the stream fails before ever opening", async () => {
    const { subscription, streams, reads, answer } = harness();
    subscription.subscribe(() => undefined);
    streams[0]!.drop();
    streams[0]!.drop();
    expect(reads).toHaveLength(1);
    await answer(0, { pairings: [] });
    expect(subscription.getState()).toMatchObject({ status: "reconnecting", snapshot: { pairings: [] } });
    streams[0]!.drop();
    expect(reads).toHaveLength(1);
  });

  it("reads once and reports closed where the browser has no EventSource", async () => {
    const { subscription, reads, answer } = harness({ eventSource: false });
    subscription.subscribe(() => undefined);
    expect(subscription.getState().status).toBe("closed");
    expect(reads).toHaveLength(1);
    await answer(0, { pairings: [] });
    expect(subscription.getState().snapshot).toEqual({ pairings: [] });
  });

  it("keeps what was shown through a failed read, and drops it on a refusal", async () => {
    const { subscription, streams, answer } = harness();
    subscription.subscribe(() => undefined);
    streams[0]!.open();
    await answer(0, { pairings: [] });
    streams[0]!.change();
    await answer(1, null, 500);
    expect(subscription.getState()).toMatchObject({ snapshot: { pairings: [] }, readFailed: true, refused: false });
    streams[0]!.change();
    await answer(2, null, 401);
    expect(subscription.getState()).toMatchObject({ snapshot: undefined, readFailed: true, refused: true });
  });

  it("drops a read that finishes after the last reader left", async () => {
    const { subscription, streams, answer } = harness();
    const leave = subscription.subscribe(() => undefined);
    streams[0]!.open();
    leave();
    await answer(0, { pairings: [{ pairingCode: "late" }] });
    expect(subscription.getState().snapshot).toBeUndefined();
  });
});
