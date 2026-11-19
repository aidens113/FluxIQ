import { DeletionPending } from "fluxiq/platform";
import type { EnvironmentRecord } from "fluxiq/platform";
import { describe, expect, it, vi } from "vitest";
import { purgeEnvironments } from "../purge-environments";

const request = { accountId: "account-a", workspaceIds: ["ws-a", "ws-b"], operationId: "receipt-1" };
const none = { listByAccount: async () => [], listByWorkspace: async () => [] };
const held = { listByAccount: async () => [{ environmentId: "env-1" } as EnvironmentRecord], listByWorkspace: async () => [] };

describe("purgeEnvironments", () => {
  it("purges the account, then each deleted workspace, under the receipt id", async () => {
    const calls: string[] = [];
    const controller = {
      purgeAccount: vi.fn(async (id: string, op: string) => {
        calls.push(`account ${id} ${op}`);
        return [];
      }),
      purgeWorkspace: vi.fn(async (id: string, op: string) => {
        calls.push(`workspace ${id} ${op}`);
        return [];
      })
    };
    await purgeEnvironments({ controller: async () => controller, records: async () => none })(request);
    expect(calls).toEqual(["account account-a receipt-1", "workspace ws-a receipt-1", "workspace ws-b receipt-1"]);
  });

  it("does nothing where nothing is billed", async () => {
    const records = vi.fn(async () => none);
    await expect(purgeEnvironments({ controller: async () => null, records })(request)).resolves.toBeUndefined();
    expect(records).not.toHaveBeenCalled();
  });

  it("waits (DeletionPending) on a release that failed part-way, and on records whose controller cannot be composed", async () => {
    const failing = { purgeAccount: async (): Promise<string[]> => { throw new AggregateError([new Error("driver down")], "1 of 1 environments could not be deleted."); }, purgeWorkspace: async () => [] };
    await expect(purgeEnvironments({ controller: async () => failing, records: async () => none })(request)).rejects.toMatchObject({ name: "DeletionPending", reason: "environments_pending" });
    const unavailable = async (): Promise<null> => { throw new Error("environments.driver_unset"); };
    await expect(purgeEnvironments({ controller: unavailable, records: async () => held })(request)).rejects.toBeInstanceOf(DeletionPending);
    await expect(purgeEnvironments({ controller: unavailable, records: async () => none })(request)).resolves.toBeUndefined();
  });

  it("throws any other failure as it came", async () => {
    const broken = { purgeAccount: async (): Promise<string[]> => { throw new TypeError("bad"); }, purgeWorkspace: async () => [] };
    await expect(purgeEnvironments({ controller: async () => broken, records: async () => none })(request)).rejects.toBeInstanceOf(TypeError);
  });
});
