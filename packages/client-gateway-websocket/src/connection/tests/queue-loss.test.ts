import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket } from "./fake-socket.ts";
import { connectReady, harness, SYNTHETIC_TOKEN } from "./harness.ts";

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FluxIQClientGatewayConnection queue loss", () => {
  it("sends the loss marker before the queued sends and tells the host after the flush", async () => {
    const h = harness({ token: SYNTHETIC_TOKEN, outboxLimits: { limit: 1 } });
    await h.outbox.setLineage("lineage.stored");
    await h.connection.send("client.state_update", { state: { step: 1 } });
    await h.connection.send("client.state_update", { state: { step: 2 } });
    const socket = await connectReady(h);
    expect(socket.sentTypes()).toEqual(["client.hello", "client.error", "client.state_update"]);
    expect(socket.sent[1]!.payload).toMatchObject({ code: "client.outbox.entries_lost", metadata: { count: 1, byReason: { count_limit: 1 } } });
    expect(socket.sent[2]!.payload).toEqual({ state: { step: 2 } });
    expect(h.losses).toEqual([{ count: 1, byReason: { count_limit: 1 } }]);
    expect(await h.outbox.lost()).toBeUndefined();
  });

  it("does not tell the host of a loss when none was recorded", async () => {
    const h = harness({ token: SYNTHETIC_TOKEN });
    await h.outbox.setLineage("lineage.stored");
    await h.connection.send("client.state_update", { state: { step: 1 } });
    await connectReady(h);
    expect(h.losses).toEqual([]);
  });

  it("keeps the loss, and does not tell the host, when the marker cannot be sent", async () => {
    const h = harness({ token: SYNTHETIC_TOKEN, outboxLimits: { limit: 1 }, onSessionReady: (connection) => connection.markSessionReady() });
    await h.outbox.setLineage("lineage.stored");
    await h.connection.send("client.state_update", { state: { step: 1 } });
    await h.connection.send("client.state_update", { state: { step: 2 } });
    const socket = await connectReady(h);
    socket.failSends = true;
    await expect(h.connection.flushQueue()).rejects.toThrow("The fake socket refused the send.");
    expect(h.losses).toEqual([]);
    expect(await h.outbox.lost()).toEqual({ count: 1, byReason: { count_limit: 1 } });
    expect(h.connection.statusFields().queueSize).toBe(1);
  });
});
