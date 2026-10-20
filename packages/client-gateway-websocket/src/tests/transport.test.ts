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
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(readonly url: string) {
    SilentWebSocket.last = this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

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

describe("FluxIQClientGatewayWebSocketClient.send envelope", () => {
  async function ready(): Promise<{ gateway: FluxIQClientGatewayWebSocketClient; socket: SilentWebSocket }> {
    let minted = 0;
    const gateway = new FluxIQClientGatewayWebSocketClient({
      url: "ws://127.0.0.1:1/client",
      client: { clientId: "extension.test", clientType: "extension", name: "Test extension" },
      WebSocketImpl: SilentWebSocket,
      idFactory: () => `fresh.${++minted}`,
      now: () => 5_000
    });
    const connected = gateway.connect();
    const socket = SilentWebSocket.last!;
    socket.dispatch("open");
    await connected;
    const session = { id: "server-message.1", type: "server.session_ready", protocolVersion: 1, timestamp: 1, payload: { sessionId: "wire.now" } };
    socket.dispatch("message", { data: JSON.stringify(session) });
    socket.sent.length = 0;
    return { gateway, socket };
  }

  it("keeps a queued envelope's id, timestamp and correlation id, under the current socket's session (D16)", async () => {
    const { gateway, socket } = await ready();
    const sent = await gateway.send("client.state_update", { state: { step: 1 } }, { id: "queued.7", timestamp: 1_234, correlationId: "command.3" });
    const wire = JSON.parse(socket.sent[0]!) as Record<string, unknown>;
    expect(wire).toMatchObject({ id: "queued.7", timestamp: 1_234, correlationId: "command.3", sessionId: "wire.now", clientId: "extension.test" });
    expect(sent).toMatchObject({ id: "queued.7", timestamp: 1_234, correlationId: "command.3" });
  });

  it("mints a fresh id and timestamp when none is given", async () => {
    const { gateway, socket } = await ready();
    await gateway.send("client.state_update", { state: { step: 1 } });
    const wire = JSON.parse(socket.sent[0]!) as Record<string, unknown>;
    expect(wire.id).toBe("fresh.2");
    expect(wire.timestamp).toBe(5_000);
    expect(wire.sessionId).toBe("wire.now");
    expect("correlationId" in wire).toBe(false);
  });
});
