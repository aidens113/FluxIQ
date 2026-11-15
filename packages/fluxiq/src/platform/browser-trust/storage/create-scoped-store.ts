import type { ClientGatewayTrustedClientStore } from "../../../client-gateway/index.ts";
import { ClientTrustConflictError } from "../model/index.ts";
import type { ClientTrustDatabase } from "./database.ts";
import { ClientTrustRecords } from "./records.ts";
import { copyClientTrustRecord } from "./validate-client.ts";

type ScopedStoreOptions = {
  workspaceId: string;
  now(): number;
  transaction<T>(operation: (db: ClientTrustDatabase) => Promise<T>): Promise<T>;
  read<T>(operation: (db: ClientTrustDatabase) => Promise<T>): Promise<T | null>;
  track<T>(operation: () => Promise<T>): Promise<T>;
};

/** A local operation queue orders one adapter; SQLite generation CAS isolates independent writers and processes. */
export function createClientTrustScopedStore(options: ScopedStoreOptions): ClientGatewayTrustedClientStore {
  let generation: number | undefined;
  let pending = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    return options.track(() => {
      const result = pending.then(operation);
      // The caller and tracked operation retain errors; this promise only keeps the next operation ordered.
      pending = result.then(() => undefined, () => undefined);
      return result;
    });
  }
  return {
    load: () => serialize(async () => {
      const snapshot = await options.read((db) => new ClientTrustRecords(db).load(options.workspaceId)) ?? { generation: 0, clients: [] };
      generation = snapshot.generation;
      return snapshot.clients;
    }),
    save: (clients) => {
      const snapshot = clients.map(copyClientTrustRecord);
      return serialize(async () => {
        if (generation === undefined) throw new ClientTrustConflictError("not-loaded");
        const expectedGeneration = generation;
        const now = options.now();
        if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Invalid browser trust clock.");
        const next = await options.transaction((db) => new ClientTrustRecords(db).replace(options.workspaceId, expectedGeneration, snapshot, now));
        generation = next;
      });
    }
  };
}
