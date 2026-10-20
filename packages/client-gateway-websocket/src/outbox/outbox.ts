import type { ClientGatewayActionResult, ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import { clientGatewayOutboxDeliverable } from "./deliverable.ts";
import { clientGatewayOutboxEntryBytes } from "./entry-bytes.ts";
import { clientGatewayOutboxKeep } from "./keep.ts";
import { clientGatewayOutboxLossMarker, clientGatewayOutboxLossMerge, type ClientGatewayOutboxLoss } from "./loss/index.ts";
import type {
  ClientGatewayOutboxBinding,
  ClientGatewayOutboxEntry,
  ClientGatewayOutboxStore
} from "./types.ts";

/** How many entries an outbox keeps unless told otherwise; past it the oldest are dropped. */
const DEFAULT_LIMIT = 1_000;

/** What an outbox is given beside its store. */
export type ClientGatewayOutboxOptions = {
  /** The most entries kept (default 1,000); past it the oldest are dropped. */
  limit?: number;
  /**
   * The most bytes the entries may take together, as `measure` counts them
   * (default unlimited). A host whose store has a quota passes what it can
   * spare for the queue, leaving room for the lineage and the loss record.
   */
  byteBudget?: number;
  /** An entry's size in bytes (default `clientGatewayOutboxEntryBytes`), taken once when it is queued. */
  measure?: (entry: ClientGatewayOutboxEntry) => number;
};

/**
 * The client's offline queue: messages that could not be sent while the socket
 * was down, each bound to the trust lineage, project and recording it was
 * queued under, delivered after `server.session_ready` only where that binding
 * still holds (see `clientGatewayOutboxDeliverable`).
 *
 * The queue is bounded by a count and a byte budget. Whatever it has to drop,
 * oldest first, and whatever a refused store write costs, is counted in an
 * explicit loss record (`lost()`), never dropped silently, and the next flush
 * reports it to the gateway before the surviving entries.
 *
 * Every operation runs one after another on a single chain, so an enqueue that
 * arrives during a flush waits for it and is never overwritten by the flush's
 * final write. For the same reason the `send` passed to `flush` must not call
 * back into this outbox (an enqueue from inside it would wait on the flush that
 * is waiting on it).
 */
export class ClientGatewayOutbox {
  private readonly store: ClientGatewayOutboxStore;
  private readonly limit: number;
  private readonly byteBudget: number;
  private readonly measure: (entry: ClientGatewayOutboxEntry) => number;
  private chain: Promise<unknown> = Promise.resolve();
  // A loss no write has stored yet, because the store refused every write
  // since it happened; merged into the next write that succeeds.
  private held: ClientGatewayOutboxLoss | undefined;

  constructor(store: ClientGatewayOutboxStore, options: ClientGatewayOutboxOptions = {}) {
    const limit = options.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1) throw new Error("The outbox limit must be a positive whole number of entries.");
    const byteBudget = options.byteBudget ?? Number.POSITIVE_INFINITY;
    if (Number.isNaN(byteBudget) || byteBudget <= 0) throw new Error("The outbox byte budget must be a positive number of bytes.");
    this.store = store;
    this.limit = limit;
    this.byteBudget = byteBudget;
    this.measure = options.measure ?? clientGatewayOutboxEntryBytes;
  }

  /**
   * Queues `message` under `binding`, keeping the newest entries within both
   * the count limit and the byte budget, and answers the queue size. Each entry
   * dropped is counted in the loss record by reason.
   *
   * It never throws for a refused write: it drops the oldest half of what it
   * would keep, counting them `write_failed`, and tries again, down to no
   * entries. When even that is refused the store keeps what it had, the new
   * entry is counted lost, the loss is held until a write succeeds, and the
   * answer is the size the store still holds. The order of what is kept never
   * changes.
   */
  enqueue(message: ClientGatewayClientMessage, binding: ClientGatewayOutboxBinding): Promise<number> {
    return this.run(async () => {
      const state = await this.store.read();
      const queued = { binding, message, bytes: this.measure({ binding, message }) };
      const measured = state.entries.map((entry) => ({ ...entry, bytes: entry.bytes ?? this.measure(entry) }));
      const { kept, loss } = clientGatewayOutboxKeep([...measured, queued], { limit: this.limit, byteBudget: this.byteBudget });
      let entries = kept;
      let dropped = loss;
      for (;;) {
        try {
          await this.persist(state.lineage, entries, clientGatewayOutboxLossMerge(state.lost, this.held, dropped));
          return entries.length;
        } catch {
          if (entries.length === 0) {
            const reason = kept.includes(queued) ? "write_failed" : "byte_budget";
            this.held = clientGatewayOutboxLossMerge(this.held, { count: 1, byReason: { [reason]: 1 } });
            return state.entries.length;
          }
          const cut = Math.ceil(entries.length / 2);
          dropped = clientGatewayOutboxLossMerge(dropped, { count: cut, byReason: { write_failed: cut } });
          entries = entries.slice(cut);
        }
      }
    });
  }

  /**
   * Delivers the entries that match `current`, in queue order, through `send`,
   * and drops the rest. The drops are written before the first send. When a
   * loss is recorded, one `client.error` marker naming it
   * (`clientGatewayOutboxLossMarker`) is sent first, and the loss is cleared
   * only once it was sent; a marker that fails to send keeps the loss and the
   * entries and rethrows. When an entry's send fails, the undelivered matching
   * tail (the failed entry first) is written back and the failure rethrown;
   * otherwise the queue is left empty. Answers the loss it reported, if any.
   * `send` must not call back into this outbox.
   */
  flush(
    current: ClientGatewayOutboxBinding,
    send: (message: ClientGatewayClientMessage) => Promise<unknown>
  ): Promise<{ delivered: number; dropped: number; lost: ClientGatewayOutboxLoss | undefined }> {
    return this.run(async () => {
      const state = await this.store.read();
      const { deliver, dropped } = clientGatewayOutboxDeliverable(state.entries, current);
      const lost = clientGatewayOutboxLossMerge(state.lost, this.held);
      if (dropped.length > 0) await this.persist(state.lineage, deliver, lost);
      if (lost) {
        await send(clientGatewayOutboxLossMarker(lost));
        this.held = undefined;
        await this.persist(state.lineage, deliver, undefined);
      }
      for (let index = 0; index < deliver.length; index += 1) {
        try {
          await send(deliver[index]!.message);
        } catch (error) {
          await this.persist(state.lineage, deliver.slice(index), undefined);
          throw error;
        }
      }
      if (deliver.length > 0) await this.persist(state.lineage, [], undefined);
      return { delivered: deliver.length, dropped: dropped.length, lost };
    });
  }

  /** The loss not yet reported to the gateway, if any: what the next flush sends first. */
  lost(): Promise<ClientGatewayOutboxLoss | undefined> {
    return this.run(async () => clientGatewayOutboxLossMerge((await this.store.read()).lost, this.held));
  }

  /**
   * The first queued `client.action_result` for `commandId` under the lineage
   * `session`, or `undefined`. A client's `interrupted` reads as `unknown`, the
   * status Core gives a result whose effect is uncertain.
   */
  actionResult(commandId: string, session: string): Promise<ClientGatewayActionResult | undefined> {
    return this.run(async () => {
      for (const { binding, message } of (await this.store.read()).entries) {
        if (binding.session !== session || message.type !== "client.action_result" || message.payload.commandId !== commandId) continue;
        const { status, ...rest } = message.payload;
        return { ...rest, status: status === "interrupted" ? "unknown" : status };
      }
      return undefined;
    });
  }

  /** Removes the queued `client.recording_event` entries sent under `eventId`, and answers how many there were. */
  removeRecordingEvent(eventId: string): Promise<number> {
    return this.run(async () => {
      const state = await this.store.read();
      const kept = state.entries.filter(({ message }) => !(message.type === "client.recording_event" && message.payload.eventId === eventId));
      const removed = state.entries.length - kept.length;
      if (removed > 0) await this.persist(state.lineage, kept, clientGatewayOutboxLossMerge(state.lost, this.held));
      return removed;
    });
  }

  /** How many entries are queued, whatever their binding. */
  size(): Promise<number> {
    return this.run(async () => (await this.store.read()).entries.length);
  }

  /** The stored trust lineage, if one was set. */
  lineage(): Promise<string | undefined> {
    return this.run(async () => (await this.store.read()).lineage);
  }

  /** Stores `id` as the current trust lineage; queued entries are untouched until the next flush judges them. */
  setLineage(id: string): Promise<void> {
    return this.run(async () => {
      const state = await this.store.read();
      await this.persist(id, state.entries, clientGatewayOutboxLossMerge(state.lost, this.held));
    });
  }

  // Writes the whole state. `lost` is written exactly as given, so a caller
  // that merged the held loss into it lets the held one go once the write
  // succeeds; one that passes less must have reported the rest first.
  private async persist(lineage: string | undefined, entries: ClientGatewayOutboxEntry[], lost: ClientGatewayOutboxLoss | undefined): Promise<void> {
    await this.store.write({ ...(lineage !== undefined ? { lineage } : {}), entries, ...(lost ? { lost } : {}) });
    this.held = undefined;
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.chain.then(operation);
    // The next operation waits only for this one to settle; its failure reaches the caller through `result`.
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }
}
