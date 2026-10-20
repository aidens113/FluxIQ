import { describe, expect, it } from "vitest";
import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import {
  CLIENT_GATEWAY_OUTBOX_LOSS_REASONS,
  ClientGatewayOutbox,
  clientGatewayMemoryOutboxStore,
  clientGatewayOutboxLossMarker
} from "../index.ts";
import { binding, stateUpdate } from "./messages.ts";

const own = binding("lineage.1", "project.1");
const current = binding("lineage.1", "project.1", null);

async function outboxWithLoss() {
  const store = clientGatewayMemoryOutboxStore();
  const outbox = new ClientGatewayOutbox(store, { limit: 2 });
  const messages = [stateUpdate(), stateUpdate(), stateUpdate()];
  for (const message of messages) await outbox.enqueue(message, own);
  return { store, outbox, kept: messages.slice(1) };
}

describe("ClientGatewayOutbox loss reporting", () => {
  it("names the reasons in a fixed order", () => {
    expect(CLIENT_GATEWAY_OUTBOX_LOSS_REASONS).toEqual(["count_limit", "byte_budget", "write_failed"]);
  });

  it("builds the marker as a client.error carrying only the counts", () => {
    const marker = clientGatewayOutboxLossMarker({ count: 3, byReason: { count_limit: 1, write_failed: 2 } });
    expect(marker.type).toBe("client.error");
    expect(marker.payload).toEqual({
      code: "client.outbox.entries_lost",
      message: "3 queued messages were lost before they could be sent.",
      metadata: { count: 3, byReason: { count_limit: 1, write_failed: 2 } }
    });
    expect(clientGatewayOutboxLossMarker({ count: 1, byReason: { byte_budget: 1 } }).payload.message)
      .toBe("1 queued message was lost before it could be sent.");
  });

  it("sends the marker before the queued entries, reports the loss, and clears it", async () => {
    const { store, outbox, kept } = await outboxWithLoss();
    const sent: ClientGatewayClientMessage[] = [];
    const outcome = await outbox.flush(current, async (message) => {
      sent.push(message);
    });
    expect(sent.map((message) => message.type)).toEqual(["client.error", "client.state_update", "client.state_update"]);
    expect(sent.slice(1).map((message) => message.id)).toEqual(kept.map((message) => message.id));
    expect(sent[0]!.payload).toMatchObject({ code: "client.outbox.entries_lost", metadata: { count: 1, byReason: { count_limit: 1 } } });
    expect(outcome).toEqual({ delivered: 2, dropped: 0, lost: { count: 1, byReason: { count_limit: 1 } } });
    expect((await store.read()).lost).toBeUndefined();
    expect(await outbox.lost()).toBeUndefined();
  });

  it("sends the marker even when nothing else is deliverable", async () => {
    const store = clientGatewayMemoryOutboxStore();
    const outbox = new ClientGatewayOutbox(store, { limit: 1 });
    await outbox.enqueue(stateUpdate(), binding("lineage.0", "project.1"));
    await outbox.enqueue(stateUpdate(), binding("lineage.0", "project.1"));
    const sent: string[] = [];
    const outcome = await outbox.flush(current, async (message) => {
      sent.push(message.type);
    });
    expect(sent).toEqual(["client.error"]);
    expect(outcome).toEqual({ delivered: 0, dropped: 1, lost: { count: 1, byReason: { count_limit: 1 } } });
    expect(await store.read()).toEqual({ entries: [] });
  });

  it("clears the loss once the marker is sent, even when a later entry fails to send", async () => {
    const { store, outbox, kept } = await outboxWithLoss();
    await expect(outbox.flush(current, async (message) => {
      if (message.id === kept[0]!.id) throw new Error("socket closed");
    })).rejects.toThrow("socket closed");
    const state = await store.read();
    expect(state.lost).toBeUndefined();
    expect(state.entries.map((queued) => queued.message.id)).toEqual(kept.map((message) => message.id));
  });

  it("keeps the loss and the entries when the marker cannot be sent", async () => {
    const { store, outbox, kept } = await outboxWithLoss();
    const failure = new Error("socket closed");
    await expect(outbox.flush(current, async () => { throw failure; })).rejects.toBe(failure);
    const state = await store.read();
    expect(state.lost).toEqual({ count: 1, byReason: { count_limit: 1 } });
    expect(state.entries.map((queued) => queued.message.id)).toEqual(kept.map((message) => message.id));
  });

  it("sends no marker and reports no loss when nothing was lost", async () => {
    const outbox = new ClientGatewayOutbox(clientGatewayMemoryOutboxStore());
    await outbox.enqueue(stateUpdate(), own);
    const sent: string[] = [];
    const outcome = await outbox.flush(current, async (message) => {
      sent.push(message.type);
    });
    expect(sent).toEqual(["client.state_update"]);
    expect(outcome.lost).toBeUndefined();
  });

  it("reports a held loss that was never written", async () => {
    const inner = clientGatewayMemoryOutboxStore();
    let broken = true;
    const outbox = new ClientGatewayOutbox({
      read: () => inner.read(),
      write: async (state) => {
        if (broken) throw new Error("The storage area is full.");
        await inner.write(state);
      }
    });
    await outbox.enqueue(stateUpdate(), own);
    broken = false;
    const sent: string[] = [];
    const outcome = await outbox.flush(current, async (message) => {
      sent.push(message.type);
    });
    expect(sent).toEqual(["client.error"]);
    expect(outcome.lost).toEqual({ count: 1, byReason: { write_failed: 1 } });
    expect(await outbox.lost()).toBeUndefined();
    expect((await inner.read()).lost).toBeUndefined();
  });
});
