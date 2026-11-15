import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_GATEWAY_OPEN_TIMEOUT_MS,
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  FluxIQClientGatewayOpenError,
  FluxIQClientGatewayWebSocketClient,
  type FluxIQClientGatewayWebSocketOptions,
  type FluxIQWebSocketLike
} from "../index.ts";

// A socket that stays CONNECTING until the test says otherwise: the shape of a
// gateway that accepted the TCP connection and never answered the upgrade.
class SilentWebSocket implements FluxIQWebSocketLike {
  static last: SilentWebSocket | undefined;
  readyState = 0;
  closed = false;
  refuseCredentialAcknowledgement = false;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(readonly url: string) {
    SilentWebSocket.last = this;
  }

  send(data: string): void {
    if (this.refuseCredentialAcknowledgement && JSON.parse(data).type === "client.credential_received") throw new Error("Synthetic lost acknowledgement.");
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

describe("FluxIQClientGatewayWebSocketClient credential persistence", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function deferredWrite() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }

  function persisted(tokenStorage: NonNullable<FluxIQClientGatewayWebSocketOptions["tokenStorage"]>) {
    return new FluxIQClientGatewayWebSocketClient({
      client: { clientId: "extension.persistence", clientType: "extension" },
      WebSocketImpl: SilentWebSocket,
      tokenStorage
    });
  }

  async function open(gateway: FluxIQClientGatewayWebSocketClient) {
    const connecting = gateway.connect();
    const socket = SilentWebSocket.last!;
    socket.dispatch("open");
    await connecting;
    return socket;
  }

  function accept(socket: SilentWebSocket, token: string, sessionId = "wire.1") {
    socket.dispatch("message", { data: JSON.stringify({
      id: "ready.test", type: "server.session_ready", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1,
      sessionId, payload: { token, sessionId }
    }) });
  }

  function laterFrames(socket: SilentWebSocket) {
    const frames = [
      { type: "server.start_recording", payload: { recordingId: "recording.test" } },
      { type: "server.activity", payload: { activityId: "activity.test", sequence: 1, subject: { kind: "build", id: "build.test", projectId: "project.test" }, phase: "thinking", label: "Working", at: "2026-11-14T00:00:00.000Z" } }
    ];
    for (const frame of frames) socket.dispatch("message", { data: JSON.stringify({ ...frame,
      id: frame.type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 2, sessionId: "wire.1"
    }) });
  }

  function acknowledgements(socket: SilentWebSocket) {
    return socket.sent.filter((data) => JSON.parse(data).type === "client.credential_received");
  }

  it("publishes and acknowledges a rotation only after storage commits, and sanitizes a rejected write", async () => {
    let stored = "synthetic.previous";
    const pending = deferredWrite();
    const gateway = persisted({ read: () => stored, write: async (token) => {
      if (token === "synthetic.rejected") await pending.promise;
      stored = token;
    } });
    const ready: string[] = [];
    const messages: string[] = [];
    const errors: Error[] = [];
    const closes: unknown[] = [];
    gateway.on("session_ready", ({ message }) => { ready.push(message.payload.sessionId); });
    gateway.on("message", ({ message }) => { messages.push(message.type); });
    gateway.on("error", ({ event }) => { errors.push(event as Error); });
    gateway.on("close", ({ event }) => { closes.push(event); });
    const socket = await open(gateway);
    accept(socket, "synthetic.committed");
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toEqual(["wire.1"]);
    expect(acknowledgements(socket)).toHaveLength(1);
    accept(socket, "synthetic.rejected", "wire.2");
    await vi.advanceTimersByTimeAsync(0);
    expect(gateway.currentSessionId).toBe("wire.1");
    expect(messages).toEqual(["server.session_ready"]);
    expect(acknowledgements(socket)).toHaveLength(1);
    pending.reject(Object.assign(new Error("synthetic.rejected storage secret"), { name: "synthetic.secret", cause: "synthetic.committed" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(stored).toBe("synthetic.committed");
    expect(gateway.connected).toBe(false);
    expect(gateway.currentSessionId).toBeUndefined();
    expect(socket.closed).toBe(true);
    expect(ready).toEqual(["wire.1"]);
    expect(messages).toEqual(["server.session_ready"]);
    expect(acknowledgements(socket)).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("FluxIQ could not save the connection credential. Reconnect when storage is available.");
    expect(errors[0]!.cause).toBeUndefined();
    const visible = JSON.stringify({ errors: errors.map((error) => ({ name: error.name, message: error.message, cause: error.cause })), closes });
    expect(visible).not.toContain("synthetic.");
  });

  it.each(["resolve", "reject"] as const)("ignores a replaced socket's late storage %s and late events", async (outcome) => {
    const pending = deferredWrite();
    let stored = "synthetic.previous";
    const gateway = persisted({ read: () => stored, write: async (token) => {
      if (token === "synthetic.old") await pending.promise;
      stored = token;
    } });
    const ready: string[] = [];
    const errors: unknown[] = [];
    gateway.on("session_ready", ({ message }) => { ready.push(message.payload.sessionId); });
    gateway.on("error", ({ event }) => { errors.push(event); });
    const old = await open(gateway);
    accept(old, "synthetic.old", "wire.old");
    await vi.advanceTimersByTimeAsync(0);
    await gateway.close();
    const connecting = gateway.connect();
    const current = SilentWebSocket.last!;
    current.dispatch("open");
    await vi.advanceTimersByTimeAsync(0);
    old.dispatch("close", { code: 1006 });
    old.dispatch("error", new Error("synthetic.old failure"));
    accept(old, "synthetic.ignored");
    expect(gateway.connected).toBe(true);
    if (outcome === "resolve") pending.resolve();
    else pending.reject(new Error("synthetic.old rejection"));
    await connecting;
    accept(current, "synthetic.current", "wire.current");
    await vi.advanceTimersByTimeAsync(0);
    expect(stored).toBe("synthetic.current");
    expect(gateway.connected).toBe(true);
    expect(gateway.currentSessionId).toBe("wire.current");
    expect(ready).toEqual(["wire.current"]);
    expect(acknowledgements(old)).toHaveLength(0);
    expect(acknowledgements(current)).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("serializes rotations so an older slow write cannot overwrite the newest credential", async () => {
    const pending = deferredWrite();
    const writes: string[] = [];
    let stored: string | undefined;
    const gateway = persisted({ read: () => stored, write: async (token) => {
      writes.push(token);
      if (token === "synthetic.first") await pending.promise;
      stored = token;
    } });
    const ready: string[] = [];
    gateway.on("session_ready", ({ message }) => { ready.push(message.payload.token); });
    const socket = await open(gateway);
    accept(socket, "synthetic.first");
    accept(socket, "synthetic.second");
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual(["synthetic.first"]);
    expect(ready).toEqual([]);
    expect(acknowledgements(socket)).toHaveLength(0);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual(["synthetic.first", "synthetic.second"]);
    expect(stored).toBe("synthetic.second");
    expect(ready).toEqual(["synthetic.first", "synthetic.second"]);
    expect(acknowledgements(socket)).toHaveLength(2);
  });

  it.each(["resolve", "reject"] as const)("holds later commands, activity and session id behind a pending write that will %s", async (outcome) => {
    const pending = deferredWrite();
    const gateway = persisted({ read: () => undefined, write: () => pending.promise });
    const seen: string[] = [];
    gateway.on("message", ({ message }) => { seen.push(message.type); });
    gateway.on("session_ready", () => { seen.push("ready"); });
    gateway.on("start_recording", () => { seen.push("recording"); });
    gateway.on("activity", () => { seen.push("activity"); });
    const socket = await open(gateway);
    accept(socket, "synthetic.pending");
    laterFrames(socket);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([]);
    expect(gateway.currentSessionId).toBeUndefined();
    expect(acknowledgements(socket)).toHaveLength(0);
    if (outcome === "resolve") pending.resolve();
    else pending.reject(new Error("synthetic.storage rejection"));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual(outcome === "resolve"
      ? ["server.session_ready", "ready", "server.start_recording", "recording", "server.activity", "activity"]
      : []);
    expect(gateway.currentSessionId).toBe(outcome === "resolve" ? "wire.1" : undefined);
    expect(acknowledgements(socket)).toHaveLength(outcome === "resolve" ? 1 : 0);
  });

  it.each(["throw", "reject"] as const)("sanitizes a credential read %s and closes without sending a hello", async (outcome) => {
    const gateway = persisted({ read: () => {
      const error = new Error("synthetic.read secret");
      if (outcome === "throw") throw error;
      return Promise.reject(error);
    }, write: () => undefined });
    const errors: Error[] = [];
    const closes: unknown[] = [];
    gateway.on("error", ({ event }) => { errors.push(event as Error); });
    gateway.on("close", ({ event }) => { closes.push(event); });
    const socket = await open(gateway);
    expect(socket.closed).toBe(true);
    expect(socket.sent).toEqual([]);
    expect(gateway.connected).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("FluxIQ could not read the connection credential. Reconnect when storage is available.");
    expect(errors[0]!.cause).toBeUndefined();
    expect(closes).toHaveLength(1);
    expect(JSON.stringify(closes)).not.toContain("synthetic.");
  });

  it.each(["resolve", "reject"] as const)("ignores a replaced socket's late credential read %s", async (outcome) => {
    let resolve!: (token: string) => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<string>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    let reads = 0;
    const gateway = persisted({ read: () => ++reads === 1 ? pending : "synthetic.current", write: () => undefined });
    const errors: unknown[] = [];
    const ready: string[] = [];
    gateway.on("error", ({ event }) => { errors.push(event); });
    gateway.on("session_ready", ({ message }) => { ready.push(message.payload.sessionId); });
    const firstConnect = gateway.connect();
    const old = SilentWebSocket.last!;
    old.dispatch("open");
    await vi.advanceTimersByTimeAsync(0);
    await gateway.close();
    const current = await open(gateway);
    accept(current, "synthetic.current", "wire.current");
    await vi.advanceTimersByTimeAsync(0);
    if (outcome === "resolve") resolve("synthetic.old");
    else reject(new Error("synthetic.old read secret"));
    await firstConnect;
    expect(old.sent).toEqual([]);
    expect(gateway.connected).toBe(true);
    expect(gateway.currentSessionId).toBe("wire.current");
    expect(ready).toEqual(["wire.current"]);
    expect(errors).toEqual([]);
  });

  it("publishes one explicit close and suppresses its late native duplicate", async () => {
    const gateway = persisted({ read: () => undefined, write: () => undefined });
    const closes: unknown[] = [];
    gateway.on("close", ({ event }) => { closes.push(event); });
    const old = await open(gateway);
    await gateway.close(3000, "Finished");
    await gateway.close();
    const current = await open(gateway);
    old.dispatch("close", { code: 3000, reason: "Finished" });
    expect(closes).toEqual([{ code: 3000, reason: "Finished" }]);
    expect(gateway.connected).toBe(true);
    expect(current.closed).toBe(false);
  });

  it("resumes with the committed credential when its acknowledgement was lost", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      let stored: string | undefined;
      const gateway = persisted({ read: () => stored, write: (token) => { stored = token; } });
      const ready: string[] = [];
      gateway.on("session_ready", ({ message }) => { ready.push(message.payload.token); });
      const socket = await open(gateway);
      socket.refuseCredentialAcknowledgement = true;
      accept(socket, "synthetic.committed");
      await vi.advanceTimersByTimeAsync(0);
      expect(ready).toEqual(["synthetic.committed"]);
      expect(acknowledgements(socket)).toHaveLength(0);
      await gateway.close();
      const resumed = await open(gateway);
      expect(JSON.parse(resumed.sent[0]!).payload.token).toBe("synthetic.committed");
      expect(warn).toHaveBeenCalledWith("FluxIQ could not tell Core it stored its new credential; its next use will.");
    } finally {
      warn.mockRestore();
    }
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
    const session = { id: "server-message.1", type: "server.session_ready", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1, payload: { sessionId: "wire.now", token: "synthetic.envelope" } };
    await new Promise<void>((resolve) => {
      const off = gateway.on("session_ready", () => {
        off();
        resolve();
      });
      socket.dispatch("message", { data: JSON.stringify(session) });
    });
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
    expect(wire.id).toBe("fresh.3");
    expect(wire.timestamp).toBe(5_000);
    expect(wire.sessionId).toBe("wire.now");
    expect("correlationId" in wire).toBe(false);
  });
});

// A managed host's one-time ticket rides only on a hello without a token, and
// is taken at most once for each hello: a reconnect never resends it.
describe("FluxIQClientGatewayWebSocketClient enrolment ticket", () => {
  function enrolling(options: { token?: string; stored?: string } = {}): { gateway: FluxIQClientGatewayWebSocketClient; takes: () => number } {
    let held: string | undefined = "fxet_synthetic-ticket";
    let taken = 0;
    const gateway = new FluxIQClientGatewayWebSocketClient({
      url: "ws://127.0.0.1:1/client",
      client: { clientId: "extension.test", clientType: "extension", ...(options.token === undefined ? {} : { token: options.token }) },
      WebSocketImpl: SilentWebSocket,
      tokenStorage: { read: () => options.stored, write: () => undefined },
      enrolment: {
        take: () => {
          taken += 1;
          const ticket = held;
          held = undefined;
          return ticket;
        }
      }
    });
    return { gateway, takes: () => taken };
  }

  async function helloOf(gateway: FluxIQClientGatewayWebSocketClient): Promise<Record<string, unknown>> {
    const connected = gateway.connect();
    const socket = SilentWebSocket.last!;
    socket.dispatch("open");
    await connected;
    return (JSON.parse(socket.sent[0]!) as { payload: Record<string, unknown> }).payload;
  }

  it("carries the ticket in a hello with no token, and takes it once", async () => {
    const { gateway, takes } = enrolling();
    const hello = await helloOf(gateway);
    expect(hello.enrolmentTicket).toBe("fxet_synthetic-ticket");
    expect("token" in hello).toBe(false);
    expect(takes()).toBe(1);
  });

  it("never sends or takes a ticket when the hello carries a stored or given token", async () => {
    const stored = enrolling({ stored: "stored-token" });
    expect(await helloOf(stored.gateway)).toMatchObject({ token: "stored-token" });
    expect(stored.takes()).toBe(0);
    const given = enrolling({ token: "given-token" });
    const hello = await helloOf(given.gateway);
    expect(hello.token).toBe("given-token");
    expect("enrolmentTicket" in hello).toBe(false);
    expect(given.takes()).toBe(0);
  });

  it("sends no ticket on a reconnect: the source gave it up already", async () => {
    const { gateway, takes } = enrolling();
    await helloOf(gateway);
    SilentWebSocket.last!.dispatch("close", { code: 1006 });
    const again = await helloOf(gateway);
    expect("enrolmentTicket" in again).toBe(false);
    expect(takes()).toBe(2);
  });
});
