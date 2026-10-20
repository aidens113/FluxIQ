// The record a client keeps of every action it has started and not yet
// answered (Core C8), in a storage area that outlives the worker that wrote it
// (`../storage-area/`).
//
// One key per command (`<keyPrefix><commandId>`) rather than one map under one
// key: writing and clearing two commands' records never reads and rewrites the
// other's, so neither can undo the other.

import type { ClientGatewayStorageArea } from "../storage-area/index.ts";
import type { ClientGatewayCommandPlace, ClientGatewayInFlightRecord } from "./types.ts";

export type ClientGatewayInFlightRecordStoreOptions = {
  /** The prefix each command's key is stored under (default `fluxiq.inFlight.`). */
  readonly keyPrefix?: string;
};

export class ClientGatewayInFlightRecordStore {
  private readonly keyPrefix: string;

  constructor(private readonly area: ClientGatewayStorageArea, options: ClientGatewayInFlightRecordStoreOptions = {}) {
    this.keyPrefix = options.keyPrefix ?? "fluxiq.inFlight.";
  }

  async write(record: ClientGatewayInFlightRecord): Promise<void> {
    await this.area.set({ [this.keyPrefix + record.commandId]: record });
  }

  async read(commandId: string): Promise<ClientGatewayInFlightRecord | undefined> {
    return storedRecord((await this.area.get(null))[this.keyPrefix + commandId]);
  }

  async remove(commandId: string): Promise<void> {
    await this.area.remove(this.keyPrefix + commandId);
  }

  /** Every record in storage, oldest first. A value under the prefix that is not a record is left where it is. */
  async all(): Promise<ClientGatewayInFlightRecord[]> {
    const items = await this.area.get(null);
    return Object.entries(items)
      .filter(([key]) => key.startsWith(this.keyPrefix))
      .map(([, value]) => storedRecord(value))
      .filter((record): record is ClientGatewayInFlightRecord => record !== undefined)
      .sort((left, right) => left.startedAt - right.startedAt);
  }
}

/**
 * Read field by field: the area is the client's own, but a record from an
 * older build may lack a field. A place that is not a map of strings and
 * numbers is dropped and the record kept.
 */
function storedRecord(value: unknown): ClientGatewayInFlightRecord | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const { commandId, actionType, committing, startedAt } = record;
  if (typeof commandId !== "string" || typeof actionType !== "string" || typeof committing !== "boolean" || typeof startedAt !== "number") return undefined;
  const place = storedPlace(record.place);
  return place === undefined ? { commandId, actionType, committing, startedAt } : { commandId, actionType, committing, startedAt, place };
}

function storedPlace(value: unknown): ClientGatewayCommandPlace | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  return entries.every(([, field]) => typeof field === "string" || typeof field === "number") ? Object.fromEntries(entries) as ClientGatewayCommandPlace : undefined;
}
