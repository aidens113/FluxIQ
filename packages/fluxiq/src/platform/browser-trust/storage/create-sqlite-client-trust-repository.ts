import { clientGatewayCredentialHash, clientGatewayCredentialId } from "../../../client-gateway/service/credentials/index.ts";
import type { ClientTrustBinding, ClientTrustCredentialProof, ClientTrustRepository } from "../model/index.ts";
import { proveClientTrustCredential } from "../runtime/index.ts";
import { readClientTrustDatabase, withClientTrustDatabase } from "./database.ts";
import { createClientTrustScopedStore } from "./create-scoped-store.ts";
import { ClientTrustRecords } from "./records.ts";

/** One private platform authority serves scoped gateway writers and independent pre-tenant credential lookup. */
export function createSqliteClientTrustRepository(options: { filePath: string; now?: () => number }): ClientTrustRepository {
  if (typeof options.filePath !== "string" || !options.filePath) throw new TypeError("A browser trust database path is required.");
  const now = options.now ?? Date.now;
  const pending = new Set<Promise<unknown>>();
  let closed = false;
  async function track<T>(operation: () => Promise<T>): Promise<T> {
    if (closed) throw new Error("The browser trust repository is closed.");
    const result = operation();
    pending.add(result);
    try {
      return await result;
    } finally {
      pending.delete(result);
    }
  }
  return {
    scopedStore: (workspaceId) => {
      if (typeof workspaceId !== "string" || !workspaceId.trim() || workspaceId !== workspaceId.trim()) throw new TypeError("A browser trust workspace binding is required.");
      return createClientTrustScopedStore({ workspaceId, now, transaction: (operation) => withClientTrustDatabase(options.filePath, operation), read: (operation) => readClientTrustDatabase(options.filePath, operation), track });
    },
    lookupCredential: (token, lookupOptions = {}) => track(async () => {
      const time = now();
      if (!Number.isSafeInteger(time) || time < 0) throw new TypeError("Invalid browser trust clock.");
      return await readClientTrustDatabase(options.filePath, async (db): Promise<ClientTrustCredentialProof> => {
        const candidates = await new ClientTrustRecords(db).candidates(clientGatewayCredentialHash(token), clientGatewayCredentialId(token));
        let result: ClientTrustCredentialProof = { status: "invalid", reason: "unknown" };
        for (const candidate of candidates) {
          const proof = proveClientTrustCredential(candidate.workspaceId, candidate.client, token, time, lookupOptions);
          if (proof.status === "invalid") {
            if (result.status === "invalid" && proof.reason === "forged") result = proof;
            continue;
          }
          if (result.status !== "invalid") throw new Error("Browser credential has ambiguous platform authority.");
          result = proof;
        }
        return result;
      }) ?? { status: "invalid", reason: "unknown" };
    }),
    countActiveForUser: (userId, replacement) => track(async () => {
      if (typeof userId !== "string" || !userId.trim()) throw new TypeError("A client owner is required.");
      const time = now();
      if (!Number.isSafeInteger(time) || time < 0) throw new TypeError("Invalid client trust clock.");
      return await readClientTrustDatabase(options.filePath, (db) => new ClientTrustRecords(db).countActiveForUser(userId, time, replacement)) ?? 0;
    }),
    listActiveForUser: (userId) => track(async (): Promise<ClientTrustBinding[]> => {
      if (typeof userId !== "string" || !userId.trim()) throw new TypeError("A client owner is required.");
      const time = now();
      if (!Number.isSafeInteger(time) || time < 0) throw new TypeError("Invalid client trust clock.");
      return await readClientTrustDatabase(options.filePath, (db) => new ClientTrustRecords(db).listActiveForUser(userId, time)) ?? [];
    }),
    close: async () => {
      closed = true;
      const results = await Promise.allSettled([...pending]);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Browser trust operations failed while closing.");
    }
  };
}
