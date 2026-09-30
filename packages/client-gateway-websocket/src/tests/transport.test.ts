import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_GATEWAY_OPEN_TIMEOUT_MS,
  FluxIQClientGatewayOpenError,
  FluxIQClientGatewayWebSocketClient,
  type FluxIQWebSocketLike
} from "../index.ts";

// A socket that stays CONNECTING until the test says otherwise: the shape of a
// gateway that accepted the TCP connection and never answered the upgrade.
class SilentWebSocket implements FluxIQWebSocketLike {
  static last: SilentWebSocket | undefined;
  readyState = 0;
  closed = false;
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(readonly url: string) {
    SilentWebSocket.last = this;
  }

  send(): void {}

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: unknown = {}): void {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }
}

function client(openTimeoutMs?: number): FluxIQClientGatewayWebSocketClient {
  return new FluxIQClientGatewayWebSocketClient({
    url: "ws://127.0.0.1:1/client",
    client: { clientId: "extension.test", clientType: "extension", name: "Test extension" },
    WebSocketImpl: SilentWebSocket,
    ...(openTimeoutMs === undefined ? {} : { openTimeoutMs })
  });
}

describe("FluxIQClientGatewayWebSocketClient.connect deadline", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("rejects a socket that never opens with a named open_timeout, and closes it", async () => {
    const connecting = client().connect();
    const outcome = connecting.then(() => "resolved", (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(CLIENT_GATEWAY_OPEN_TIMEOUT_MS);
    const error = await outcome;
    expect(error).toBeInstanceOf(FluxIQClientGatewayOpenError);
    expect((error as FluxIQClientGatewayOpenError).code).toBe("open_timeout");
    expect((error as FluxIQClientGatewayOpenError).timeoutMs).toBe(CLIENT_GATEWAY_OPEN_TIMEOUT_MS);
    expect(SilentWebSocket.last!.closed).toBe(true);
    expect(SilentWebSocket.last!.listenerCount()).toBe(0);
  });

  it("honours a configured open deadline", async () => {
    const outcome = client(250).connect().then(() => "resolved", (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(249);
    expect(SilentWebSocket.last!.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(((await outcome) as FluxIQClientGatewayOpenError).code).toBe("open_timeout");
  });

  it("names a socket closed before it opened, without waiting out the deadline", async () => {
    const outcome = client().connect().then(() => "resolved", (error: unknown) => error);
    SilentWebSocket.last!.dispatch("close", { code: 1006 });
    const error = await outcome;
    expect((error as FluxIQClientGatewayOpenError).code).toBe("closed_before_open");
  });

  it("names a socket error before open as open_failed", async () => {
    const outcome = client().connect().then(() => "resolved", (error: unknown) => error);
    SilentWebSocket.last!.dispatch("error");
    expect(((await outcome) as FluxIQClientGatewayOpenError).code).toBe("open_failed");
  });

  it("opens normally inside the deadline and clears the timer", async () => {
    const connected = client().connect();
    SilentWebSocket.last!.dispatch("open");
    await connected;
    expect(vi.getTimerCount()).toBe(0);
    expect(SilentWebSocket.last!.closed).toBe(false);
  });

  it("refuses a deadline that is not a positive finite number", () => {
    expect(() => client(0)).toThrow(/openTimeoutMs/u);
    expect(() => client(Number.NaN)).toThrow(/openTimeoutMs/u);
  });
});
