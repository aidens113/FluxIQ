import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientGatewayMessage, type ClientGatewayClientMessage } from "../../index.ts";
import { clientGatewayMemoryOutboxStore, type ClientGatewayOutboxStore } from "../../outbox/index.ts";
import { FakeSocket } from "./fake-socket.ts";
import { connectReady, harness, SYNTHETIC_TOKEN } from "./harness.ts";

const HEARTBEAT_INTERVAL_MS = 20_000;

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

function recordingEvent(eventId: string, recordingId?: string): ClientGatewayClientMessage {
  return createClientGatewayMessage("client.recording_event", { eventId, eventType: "test.step", ...(recordingId !== undefined ? { recordingId } : {}) });
}

function errors(events: string[]): string[] {
  return events.filter((event) => event.startsWith("error"));
}

describe("FluxIQClientGatewayConnection state", () => {
  it("becoming connected clears the last error before the status is published", () => {
    const h = harness();
    h.connection.markSessionReady();
    expect(h.connection.state()).toBe("connected");
    expect(h.events).toEqual(["clearError", "emit"]);
  });

  it("failing or disconnecting keeps the error", () => {
    const h = harness();
    h.connection.markFailed();
    h.connection.markDisconnected();
    expect(h.events).toEqual(["emit", "emit"]);
  });

  it("retrying now does nothing for a session nobody asked to connect, even a failed one", () => {
    const h = harness();
    h.connection.markFailed();
    expect(h.connection.wantsConnection()).toBe(false);
    expect(h.connection.retryNow()).toBe(false);
    expect(h.connection.state()).toBe("error");
  });

  it("reports the pairing reference code until the session is ready", async () => {
    const h = harness();
    const connecting = h.connection.connect();
    await h.settle();
    await connecting;
    FakeSocket.latest().serverSays("server.pairing_required", { referenceCode: "REF-1", reason: "approval needed" });
    await h.settle();
    expect(h.connection.state()).toBe("pairing");
    expect(h.connection.statusFields().pairingReferenceCode).toBe("REF-1");
    expect(h.pairing).toEqual([{ referenceCode: "REF-1", reason: "approval needed" }]);
    FakeSocket.latest().serverSays("server.session_ready", { sessionId: "wire.1", token: SYNTHETIC_TOKEN });
    await h.settle();
    expect(h.connection.statusFields()).toMatchObject({ connectionState: "connected", pairingReferenceCode: undefined });
  });
});

// A socket that never opens: `connect()` settles at its deadline and says why.
describe("FluxIQClientGatewayConnection open failures", () => {
  it("a connect whose socket never opens settles within its deadline and names open_timeout", async () => {
    FakeSocket.reset(false);
    const h = harness({ openTimeoutMs: 30 });
    const connecting = h.connection.connect();
    await vi.advanceTimersByTimeAsync(30);
    await connecting;
    expect(h.connection.state()).toBe("error");
    expect(errors(h.events)).toEqual(["error FluxIQ did not open the connection within 1 s (open_timeout)."]);
    expect(FakeSocket.created[0]!.closed).toBe(true);
  });

  it("a connect superseded by a newer one says nothing about the newer attempt", async () => {
    FakeSocket.reset(false);
    const h = harness({ openTimeoutMs: 40 });
    const first = h.connection.connect();
    await vi.advanceTimersByTimeAsync(20);
    const second = h.connection.connect();
    await vi.advanceTimersByTimeAsync(20);
    await first;
    expect(h.connection.state()).toBe("connecting");
    expect(errors(h.events)).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    await second;
    expect(h.connection.state()).toBe("error");
    expect(errors(h.events)).toHaveLength(1);
  });

  it("a superseded socket that closes late does not drop the live connection", async () => {
    const h = harness({ autoReconnect: true });
    await connectReady(h);
    const old = FakeSocket.latest();
    await connectReady(h);
    old.drop();
    await h.settle();
    expect(h.connection.state()).toBe("connected");
    expect(FakeSocket.created).toHaveLength(2);
    h.connection.stopReconnecting();
  });
});

describe("FluxIQClientGatewayConnection reconnecting", () => {
  it("retries after a failed open, doubling the wait each time up to the cap", async () => {
    FakeSocket.reset(false);
    const h = harness({ autoReconnect: true, openTimeoutMs: 1, overrides: { reconnectBaseDelayMs: 100, reconnectMaxDelayMs: 350 } });
    void h.connection.connect();
    await vi.advanceTimersByTimeAsync(2_000);
    const created = FakeSocket.created.slice(0, 5).map((socket) => socket.createdAt);
    const gaps = created.slice(1).map((at, index) => at - created[index]!);
    // Each attempt fails at its 1 ms open deadline, then waits 100, 200, 350, 350 ms.
    expect(gaps).toEqual([101, 201, 351, 351]);
    h.connection.stopReconnecting();
  });

  it("reconnects after a dropped session and starts the backoff over once a socket opens", async () => {
    const h = harness({ autoReconnect: true });
    await connectReady(h);
    FakeSocket.latest().drop();
    expect(h.connection.state()).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.created).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await h.settle();
    expect(FakeSocket.created).toHaveLength(2);
    expect(h.connection.state()).toBe("connecting");
    FakeSocket.latest().drop();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.created).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.created).toHaveLength(3);
    h.connection.stopReconnecting();
  });

  it("stops retrying once told to stop", async () => {
    const h = harness({ autoReconnect: true });
    await connectReady(h);
    FakeSocket.latest().drop();
    expect(h.connection.state()).toBe("reconnecting");
    h.connection.stopReconnecting();
    expect(h.connection.wantsConnection()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.created).toHaveLength(1);
  });

  it("does not retry when automatic reconnection is off", async () => {
    const h = harness({ autoReconnect: false });
    await connectReady(h);
    FakeSocket.latest().drop();
    expect(h.connection.state()).toBe("disconnected");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.created).toHaveLength(1);
  });

  it("retrying now during a backoff connects at once", async () => {
    const h = harness({ autoReconnect: true });
    await connectReady(h);
    FakeSocket.latest().drop();
    expect(h.connection.retryNow()).toBe(true);
    await h.settle();
    expect(FakeSocket.created).toHaveLength(2);
    expect(h.connection.retryNow()).toBe(false);
    h.connection.stopReconnecting();
  });
});

// The trust lineage: kept while each socket resumes by token, minted whenever
// a socket had to pair or said hello without a token.
describe("FluxIQClientGatewayConnection lineage", () => {
  it("mints a lineage for a hello without a token, before the host hears the session is ready", async () => {
    const h = harness();
    await connectReady(h);
    expect(await h.outbox.lineage()).toBe("lineage.1");
    expect(h.lineagesAtReady).toEqual(["lineage.1"]);
  });

  it("keeps the lineage when a reconnect resumes by token", async () => {
    const h = harness({ autoReconnect: true });
    await connectReady(h);
    FakeSocket.latest().drop();
    await vi.advanceTimersByTimeAsync(1_000);
    await h.settle();
    expect(FakeSocket.latest().sent[0]).toMatchObject({ type: "client.hello", payload: { token: SYNTHETIC_TOKEN } });
    FakeSocket.latest().serverSays("server.session_ready", { sessionId: "wire.2", token: "synthetic-token.1" });
    await h.settle();
    expect(h.lineagesAtReady).toEqual(["lineage.1", "lineage.1"]);
    h.connection.stopReconnecting();
  });

  it("mints a new lineage when a socket with a token had to pair again", async () => {
    const h = harness({ token: SYNTHETIC_TOKEN });
    await h.outbox.setLineage("lineage.old");
    const connecting = h.connection.connect();
    await h.settle();
    await connecting;
    FakeSocket.latest().serverSays("server.pairing_required", { reason: "token refused" });
    FakeSocket.latest().serverSays("server.session_ready", { sessionId: "wire.1", token: "synthetic-token.1" });
    await h.settle();
    expect(h.lineagesAtReady).toEqual(["lineage.1"]);
  });

  it("starts a new lineage, and says why, when the stored one cannot be read", async () => {
    const inner = clientGatewayMemoryOutboxStore();
    let failReads = false;
    const store: ClientGatewayOutboxStore = {
      read: () => (failReads ? Promise.reject(new Error("store offline")) : inner.read()),
      write: (state) => inner.write(state)
    };
    const h = harness({ token: SYNTHETIC_TOKEN, store, onSessionReady: (connection) => connection.markSessionReady() });
    await h.outbox.setLineage("lineage.stored");
    await h.outbox.enqueue(createClientGatewayMessage("client.action_result", { commandId: "cmd-1", status: "succeeded" }), { session: "lineage.stored", projectId: "project.1", recordingId: null });
    const connecting = h.connection.connect();
    await h.settle();
    await connecting;
    failReads = true;
    FakeSocket.latest().serverSays("server.session_ready", { sessionId: "wire.1", token: "synthetic-token.1" });
    await h.settle();
    failReads = false;
    expect(errors(h.events)).toContain("error Could not read the connection lineage, so a new one was started: store offline");
    expect(await h.connection.queuedActionResult("cmd-1")).toBeUndefined();
  });

  it("resumes a stored lineage when the first socket of this process resumes by token", async () => {
    const h = harness({ token: SYNTHETIC_TOKEN });
    await h.outbox.setLineage("lineage.stored");
    await connectReady(h);
    expect(h.lineagesAtReady).toEqual(["lineage.stored"]);
  });
});

describe("FluxIQClientGatewayConnection offline queue", () => {
  it("queues a send while the socket is down, bound to the lineage and context, and reports the size", async () => {
    const h = harness();
    await h.outbox.setLineage("lineage.stored");
    h.context.recordingId = "recording.1";
    await h.connection.send("client.state_update", { state: { step: 1 } });
    const { entries } = await h.store.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.binding).toEqual({ session: "lineage.stored", projectId: "project.1", recordingId: "recording.1" });
    expect(entries[0]!.message).toMatchObject({ type: "client.state_update", clientId: "client.1" });
    expect(h.connection.statusFields().queueSize).toBe(1);
    expect(h.events.at(-1)).toBe("emit");
  });

  it("delivers matching queued sends after the session is ready and drops the rest", async () => {
    const h = harness({ token: SYNTHETIC_TOKEN });
    await h.outbox.setLineage("lineage.stored");
    await h.connection.send("client.state_update", { state: { step: 1 } });
    await h.outbox.enqueue(recordingEvent("event.other-lineage"), { session: "lineage.gone", projectId: "project.1", recordingId: null });
    await h.outbox.enqueue(recordingEvent("event.other-project"), { session: "lineage.stored", projectId: "project.2", recordingId: null });
    await h.outbox.enqueue(recordingEvent("event.other-recording", "recording.9"), { session: "lineage.stored", projectId: "project.1", recordingId: "recording.9" });
    await h.connection.send("client.recording_event", { eventId: "event.mine", eventType: "test.step" });
    const socket = await connectReady(h);
    expect(socket.sentTypes()).toEqual(["client.hello", "client.state_update", "client.recording_event"]);
    expect(socket.sent[2]!.payload).toMatchObject({ eventId: "event.mine" });
    expect(await h.outbox.size()).toBe(0);
    expect(h.connection.statusFields().queueSize).toBe(0);
  });

  it("delivers a queued message with the id, timestamp and correlation id it was queued with, under the new socket's session (D16)", async () => {
    const h = harness({ token: SYNTHETIC_TOKEN });
    await h.outbox.setLineage("lineage.stored");
    const queued = createClientGatewayMessage("client.state_update", { state: { step: 1 } }, { clientId: "client.1", sessionId: "wire.old", correlationId: "command.4", idFactory: () => "queued.1", now: () => 1_111 });
    await h.outbox.enqueue(queued, { session: "lineage.stored", projectId: "project.1", recordingId: null });
    const socket = await connectReady(h);
    expect(socket.sentTypes()).toEqual(["client.hello", "client.state_update"]);
    expect(socket.sent[1]).toMatchObject({ id: "queued.1", timestamp: 1_111, correlationId: "command.4", sessionId: "wire.1", clientId: "client.1" });
  });

  it("drops everything queued under the old lineage when the socket had to pair", async () => {
    const h = harness();
    await h.outbox.setLineage("lineage.stored");
    await h.connection.send("client.state_update", { state: { step: 1 } });
    const socket = await connectReady(h);
    expect(socket.sentTypes()).toEqual(["client.hello"]);
    expect(await h.outbox.size()).toBe(0);
  });

  it("queues what is sent while the socket is open but still pairing, and sends nothing over it until the session is ready", async () => {
    const h = harness();
    const connecting = h.connection.connect();
    await h.settle();
    await connecting;
    const socket = FakeSocket.latest();
    socket.serverSays("server.pairing_required", { referenceCode: "REF-1", reason: "Approve this client." });
    await h.settle();
    await h.connection.send("client.state_update", { state: { step: 1 } });
    expect(socket.sentTypes()).toEqual(["client.hello"]);
    expect(await h.outbox.size()).toBe(1);
    socket.serverSays("server.session_ready", { sessionId: "wire.1", token: SYNTHETIC_TOKEN });
    await h.settle();
    await h.connection.send("client.state_update", { state: { step: 2 } });
    expect(socket.sentTypes()).toEqual(["client.hello", "client.state_update"]);
  });

  it("sends straight to the socket once connected", async () => {
    const h = harness();
    const socket = await connectReady(h);
    await h.connection.send("client.state_update", { state: { step: 2 } });
    expect(socket.sentTypes()).toEqual(["client.hello", "client.state_update"]);
    expect(await h.outbox.size()).toBe(0);
  });

  it("keeps the undelivered tail when the socket fails during a flush", async () => {
    const h = harness({ token: SYNTHETIC_TOKEN, onSessionReady: (connection) => connection.markSessionReady() });
    await h.outbox.setLineage("lineage.stored");
    await h.connection.send("client.state_update", { state: { step: 1 } });
    await h.connection.send("client.state_update", { state: { step: 2 } });
    const socket = await connectReady(h);
    socket.failSends = true;
    await expect(h.connection.flushQueue()).rejects.toThrow("The fake socket refused the send.");
    expect(await h.outbox.size()).toBe(2);
    expect(h.connection.statusFields().queueSize).toBe(2);
  });

  it("answers a command's queued result by its id, from the current lineage only, and only a result answers", async () => {
    const h = harness();
    await h.outbox.setLineage("lineage.1");
    const own = { session: "lineage.1", projectId: "project.1", recordingId: null };
    await h.outbox.enqueue(createClientGatewayMessage("client.recording_event", { eventId: "cmd-1", eventType: "test.step", payload: { commandId: "cmd-1" } }), own);
    await h.outbox.enqueue(createClientGatewayMessage("client.action_result", { commandId: "cmd-2", status: "succeeded" }), own);
    await h.outbox.enqueue(createClientGatewayMessage("client.action_result", { commandId: "cmd-4", status: "interrupted" }), own);
    await h.outbox.enqueue(createClientGatewayMessage("client.action_result", { commandId: "cmd-5", status: "succeeded" }), { ...own, session: "lineage.0" });
    expect(await h.connection.queuedActionResult("cmd-2")).toEqual({ commandId: "cmd-2", status: "succeeded" });
    expect(await h.connection.queuedActionResult("cmd-1")).toBeUndefined();
    expect(await h.connection.queuedActionResult("cmd-3")).toBeUndefined();
    expect(await h.connection.queuedActionResult("cmd-4")).toEqual({ commandId: "cmd-4", status: "unknown" });
    expect(await h.connection.queuedActionResult("cmd-5")).toBeUndefined();
  });

  it("removes a queued recording event by its id and refreshes the size", async () => {
    const h = harness();
    await h.connection.send("client.recording_event", { eventId: "event.1", eventType: "test.step" });
    await h.connection.send("client.recording_event", { eventId: "event.2", eventType: "test.step" });
    expect(await h.connection.removeQueuedRecordingEvent("event.1")).toBe(1);
    expect(h.connection.statusFields().queueSize).toBe(1);
    expect(await h.connection.removeQueuedRecordingEvent("event.missing")).toBe(0);
  });

  it("refreshes the size from the outbox on request, publishing it only when it changed", async () => {
    const h = harness();
    await h.outbox.enqueue(recordingEvent("event.1"), { session: "", projectId: null, recordingId: null });
    expect(h.connection.statusFields().queueSize).toBe(0);
    expect(await h.connection.refreshQueueSize()).toBe(1);
    expect(h.connection.statusFields().queueSize).toBe(1);
    expect(h.events.filter((event) => event === "emit")).toHaveLength(1);
    expect(await h.connection.refreshQueueSize()).toBe(1);
    expect(h.events.filter((event) => event === "emit")).toHaveLength(1);
  });
});

describe("FluxIQClientGatewayConnection subscriptions", () => {
  it("keeps an `on` subscription across reconnects until it is removed", async () => {
    const h = harness({ autoReconnect: true });
    const seen: string[] = [];
    const off = h.connection.on("start_recording", ({ message }) => { seen.push(message.payload.recordingId); });
    await connectReady(h);
    FakeSocket.latest().serverSays("server.start_recording", { recordingId: "recording.1" });
    await h.settle();
    FakeSocket.latest().drop();
    await vi.advanceTimersByTimeAsync(1_000);
    await h.settle();
    expect(FakeSocket.created).toHaveLength(2);
    FakeSocket.latest().serverSays("server.start_recording", { recordingId: "recording.2" });
    await h.settle();
    off();
    FakeSocket.latest().serverSays("server.start_recording", { recordingId: "recording.3" });
    await h.settle();
    expect(seen).toEqual(["recording.1", "recording.2"]);
    h.connection.stopReconnecting();
  });

  it("attaches a subscription made while a socket is already open", async () => {
    const h = harness();
    await connectReady(h);
    const seen: string[] = [];
    h.connection.on("stop_recording", ({ message }) => { seen.push(message.payload.recordingId ?? "none"); });
    FakeSocket.latest().serverSays("server.stop_recording", { recordingId: "recording.1" });
    await h.settle();
    expect(seen).toEqual(["recording.1"]);
  });
});

// Staying awake while a person approves: each heartbeat tick calls `keepAlive`
// while the socket is open but not connected, and `onHeartbeat` once connected.
describe("FluxIQClientGatewayConnection heartbeat", () => {
  async function opened(token: string | undefined) {
    const h = harness(token !== undefined ? { token } : {});
    const connecting = h.connection.connect();
    await h.settle();
    await connecting;
    return h;
  }

  it("while a person approves pairing, every tick keeps the worker awake and sends no heartbeat", async () => {
    const h = await opened(undefined);
    expect(h.connection.state()).toBe("pairing");
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 15);
    expect(h.ticks).toEqual(Array(15).fill("keepAlive"));
    h.connection.closeClient();
  });

  it("while the gateway checks a saved token, every tick keeps the worker awake", async () => {
    const h = await opened(SYNTHETIC_TOKEN);
    expect(h.connection.state()).toBe("connecting");
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);
    expect(h.ticks).toEqual(["keepAlive", "keepAlive"]);
    h.connection.closeClient();
  });

  it("once connected, ticks are heartbeats, as before, and no keepalive", async () => {
    const h = await opened(undefined);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    h.connection.markSessionReady();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);
    expect(h.ticks).toEqual(["keepAlive", "heartbeat", "heartbeat"]);
    h.connection.closeClient();
  });

  it("after the socket closes, nothing ticks", async () => {
    const h = await opened(undefined);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    FakeSocket.latest().drop();
    expect(h.connection.state()).toBe("disconnected");
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 5);
    expect(h.ticks).toEqual(["keepAlive"]);
  });

  it("after the extension closes the client, nothing ticks", async () => {
    const h = await opened(undefined);
    h.connection.closeClient();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 5);
    expect(h.ticks).toEqual([]);
  });

  it("ticks at the configured interval", async () => {
    const h = harness({ overrides: { heartbeatIntervalMs: 500 } });
    const connecting = h.connection.connect();
    await h.settle();
    await connecting;
    await vi.advanceTimersByTimeAsync(1_500);
    expect(h.ticks).toEqual(["keepAlive", "keepAlive", "keepAlive"]);
    h.connection.closeClient();
  });
});
