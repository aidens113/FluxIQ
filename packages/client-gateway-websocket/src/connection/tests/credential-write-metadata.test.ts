import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewayCredentialWriteMetadata, ClientGatewayServerMessage } from "../../index.ts";
import { pendingCommit, readyWithMetadata } from "../../tests/credential-metadata-fixture.ts";
import { FakeSocket } from "./fake-socket.ts";
import { harness } from "./harness.ts";

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
});
afterEach(() => { vi.useRealTimers(); });

describe("reconnecting credential write metadata", () => {
  it("forwards metadata through the serialized write barrier before ready and acknowledgement", async () => {
    const pending = pendingCommit();
    const payload = readyWithMetadata();
    const written: Array<ClientGatewayCredentialWriteMetadata | undefined> = [];
    const ready: ClientGatewayServerMessage[] = [];
    const h = harness({ overrides: { tokenStorage: { read: () => "synthetic-previous", write: async (token, metadata) => {
      expect(token).toBe(payload.token);
      written.push(structuredClone(metadata));
      if (metadata?.user) metadata.user.email = "changed-by-storage@example.test";
      if (metadata?.workspace) metadata.workspace.workspaceId = "changed-by-storage";
      await pending.promise;
    } } } });
    h.connection.on("session_ready", ({ message }) => { ready.push(message); });
    const connecting = h.connection.connect();
    await h.settle();
    await connecting;
    const socket = FakeSocket.latest();
    socket.serverSays("server.session_ready", payload);
    await h.settle();
    const { token: _token, ...expected } = payload;
    expect(written).toEqual([{ ...expected, messageId: expect.stringMatching(/^server-message\.\d+$/u) }]);
    expect(written[0]).not.toHaveProperty("token");
    expect(socket.credentialsAcknowledged).toBe(0);
    expect(ready).toEqual([]);
    expect(h.connection.state()).toBe("connecting");
    pending.resolve();
    await h.settle();
    expect(socket.credentialsAcknowledged).toBe(1);
    expect(h.connection.state()).toBe("connected");
    expect(ready[0]!.payload).toEqual(payload);
    expect(written[0]!.messageId).toBe(ready[0]!.id);
    h.connection.stopReconnecting();
    h.connection.closeClient();
  });

  it("keeps each pending rotation's metadata with its own token", async () => {
    const pending = pendingCommit();
    const first = readyWithMetadata();
    const second = { ...readyWithMetadata(), token: "synthetic-second-token", sessionId: "wire.second", credentialExpiresAt: first.credentialExpiresAt! + 30_000 };
    const writes: Array<{ token: string; metadata: ClientGatewayCredentialWriteMetadata | undefined }> = [];
    const h = harness({ overrides: { tokenStorage: { read: () => "synthetic-previous", write: async (token, metadata) => {
      writes.push({ token, metadata });
      if (writes.length === 1) await pending.promise;
    } } } });
    const connecting = h.connection.connect();
    await h.settle();
    await connecting;
    const socket = FakeSocket.latest();
    socket.serverSays("server.session_ready", first);
    socket.serverSays("server.session_ready", second);
    await h.settle();
    expect(writes).toHaveLength(1);
    expect(socket.credentialsAcknowledged).toBe(0);
    pending.resolve();
    await h.settle();
    expect(writes.map(write => [write.token, write.metadata!.sessionId, write.metadata!.credentialExpiresAt])).toEqual([[first.token, first.sessionId, first.credentialExpiresAt], [second.token, second.sessionId, second.credentialExpiresAt]]);
    expect(writes[0]!.metadata!.messageId).not.toBe(writes[1]!.metadata!.messageId);
    expect(socket.credentialsAcknowledged).toBe(2);
    h.connection.stopReconnecting();
    h.connection.closeClient();
  });
});
