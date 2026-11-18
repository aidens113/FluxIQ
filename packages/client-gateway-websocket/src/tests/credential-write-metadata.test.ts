import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxIQClientGatewayWebSocketClient, type ClientGatewayCredentialWriteMetadata, type ClientGatewayServerMessage } from "../index.ts";
import { FakeSocket } from "../connection/tests/fake-socket.ts";
import { pendingCommit, readyWithMetadata } from "./credential-metadata-fixture.ts";

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
});
afterEach(() => { vi.useRealTimers(); });

describe("direct credential write metadata", () => {
  it("passes actual detached metadata without token before acknowledgement or later frames", async () => {
    const pending = pendingCommit();
    const writes: Array<{ token: string; metadata: ClientGatewayCredentialWriteMetadata | undefined }> = [];
    const gateway = new FluxIQClientGatewayWebSocketClient({
      client: { clientType: "extension", clientId: "client.metadata" }, WebSocketImpl: FakeSocket,
      tokenStorage: { read: () => undefined, write: async (token, metadata) => {
        writes.push({ token, metadata: structuredClone(metadata) });
        if (metadata?.user) metadata.user.displayName = "storage-local-change";
        if (metadata?.workspace) metadata.workspace.name = "storage-local-change";
        if (metadata) Reflect.set(metadata, "sessionId", "wire.changed-by-storage");
        await pending.promise;
      } }
    });
    const seen: ClientGatewayServerMessage[] = [];
    gateway.on("message", ({ message }) => { seen.push(message); });
    const connecting = gateway.connect();
    await vi.advanceTimersByTimeAsync(0);
    await connecting;
    const socket = FakeSocket.latest();
    const payload = readyWithMetadata();
    socket.serverSays("server.session_ready", payload);
    socket.serverSays("server.start_recording", { recordingId: "recording.metadata" });
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.token).toBe(payload.token);
    const { token: _token, ...expected } = payload;
    expect(writes[0]!.metadata).toEqual({ ...expected, messageId: expect.stringMatching(/^server-message\.\d+$/u) });
    expect(writes[0]!.metadata).not.toHaveProperty("token");
    expect(JSON.stringify(writes[0]!.metadata)).not.toContain(payload.token);
    expect(socket.credentialsAcknowledged).toBe(0);
    expect(gateway.currentSessionId).toBeUndefined();
    expect(seen).toEqual([]);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.credentialsAcknowledged).toBe(1);
    expect(gateway.currentSessionId).toBe(payload.sessionId);
    expect(seen.map(message => message.type)).toEqual(["server.session_ready", "server.start_recording"]);
    expect(seen[0]!.payload).toEqual(payload);
    expect(writes[0]!.metadata!.messageId).toBe(seen[0]!.id);
    await gateway.close();
  });

  it("does not invent legacy optional metadata and preserves a one-argument consumer", async () => {
    let stored: string | undefined;
    const metadata: Array<ClientGatewayCredentialWriteMetadata | undefined> = [];
    const gateway = new FluxIQClientGatewayWebSocketClient({
      client: { clientType: "extension" }, WebSocketImpl: FakeSocket,
      tokenStorage: { read: () => stored, write: (token) => { stored = token; } }
    });
    const connecting = gateway.connect();
    await vi.advanceTimersByTimeAsync(0);
    await connecting;
    const socket = FakeSocket.latest();
    socket.serverSays("server.session_ready", { sessionId: "wire.legacy", token: "synthetic-legacy-token" });
    await vi.advanceTimersByTimeAsync(0);
    expect(stored).toBe("synthetic-legacy-token");
    expect(socket.credentialsAcknowledged).toBe(1);
    await gateway.close();
    const observed = new FluxIQClientGatewayWebSocketClient({
      client: { clientType: "extension" }, WebSocketImpl: FakeSocket,
      tokenStorage: { read: () => stored, write: (_token, value) => { metadata.push(value); } }
    });
    const opening = observed.connect();
    await vi.advanceTimersByTimeAsync(0);
    await opening;
    FakeSocket.latest().serverSays("server.session_ready", { sessionId: "wire.legacy", token: "synthetic-legacy-token" });
    await vi.advanceTimersByTimeAsync(0);
    expect(metadata).toEqual([{ sessionId: "wire.legacy", messageId: expect.any(String) }]);
    await observed.close();
  });
});
