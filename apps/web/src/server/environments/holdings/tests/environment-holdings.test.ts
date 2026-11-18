import type { EnvironmentRecord, EnvironmentStore } from "fluxiq/platform";
import { describe, expect, it } from "vitest";
import { EnvironmentHoldings } from "../environment-holdings";
import { holdingStore } from "../holding-store";

const record = (environmentId: string, desired: EnvironmentRecord["desired"], accountId = "account-a"): EnvironmentRecord =>
  ({ environmentId, accountId, workspaceId: "ws-a", driver: "fake", desired, observed: desired === "deleted" ? "deleted" : "running", operationId: `op-${environmentId}` });

function stored(records: EnvironmentRecord[]): Pick<EnvironmentStore, "listByAccount"> {
  return { listByAccount: async (accountId) => records.filter((entry) => entry.accountId === accountId) };
}

describe("EnvironmentHoldings", () => {
  it("counts the account's recorded environments that are not being deleted, and its pending claims", async () => {
    const holdings = new EnvironmentHoldings(stored([record("env-1", "running"), record("env-2", "stopped"), record("env-3", "deleted"), record("env-x", "running", "account-b")]));
    expect(await holdings.claim({ accountId: "account-a", targetId: "env-4", limit: 2 })).toBe(false);
    expect(await holdings.claim({ accountId: "account-a", targetId: "env-2", limit: 2 })).toBe(true);
    expect(await holdings.claim({ accountId: "account-a", targetId: "env-4", limit: 3 })).toBe(true);
    expect(await holdings.claim({ accountId: "account-a", targetId: "env-5", limit: 3 })).toBe(false);
    expect(await holdings.claim({ accountId: "account-b", targetId: "env-y", limit: 2 })).toBe(true);
  });

  it("serializes one account's claims, so two cannot both take the last unit", async () => {
    const holdings = new EnvironmentHoldings(stored([]));
    const claims = await Promise.all(["env-1", "env-2", "env-3"].map((targetId) => holdings.claim({ accountId: "account-a", targetId, limit: 2 })));
    expect(claims.filter(Boolean)).toHaveLength(2);
  });

  it("hands a claim to the recorded environment, or frees it when the intent is refused", async () => {
    const records: EnvironmentRecord[] = [];
    const holdings = new EnvironmentHoldings(stored(records));
    const store = holdingStore({
      ...stored(records),
      recordIntent: async (intent) => {
        if (intent.environmentId === "env-refused") throw new Error("environment-exists");
        const created = record(intent.environmentId, "running");
        records.push(created);
        return { record: created, replayed: false };
      }
    } as EnvironmentStore, holdings);
    expect(await holdings.claim({ accountId: "account-a", targetId: "env-refused", limit: 1 })).toBe(true);
    await expect(store.recordIntent({ operationId: "op", environmentId: "env-refused", kind: "create", accountId: "account-a", workspaceId: "ws-a", driver: "fake" })).rejects.toThrow();
    expect(await holdings.claim({ accountId: "account-a", targetId: "env-1", limit: 1 })).toBe(true);
    await store.recordIntent({ operationId: "op-1", environmentId: "env-1", kind: "create", accountId: "account-a", workspaceId: "ws-a", driver: "fake" });
    expect(await holdings.claim({ accountId: "account-a", targetId: "env-2", limit: 1 })).toBe(false);
    expect(await holdings.claim({ accountId: "account-a", targetId: "env-1", limit: 1 })).toBe(true);
  });
});
