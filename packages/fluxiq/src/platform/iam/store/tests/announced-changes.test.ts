// Covers context/announced-changes.ts with the IamStore whose writes it announces: each successful write names its
// workspace, a refused write is not announced, and a reader announces nothing.
import { afterEach, describe, expect, it } from "vitest";
import type { IamPolicy } from "../../types.ts";
import { iamStoreChanges } from "../context/index.ts";
import { IamStore } from "../iam-store.ts";
import type { IamRecordEnvelope, IamRecordRepository, IamRecordScope } from "../repository/index.ts";

const CONTEXT = { actor: "frn:fluxiq:iam:w1:user/admin", origin: "panel", requestId: "request-1" } as const;
const USER_ACCESS: IamPolicy = { name: "FluxIQUserAccess", kind: "identity", document: { Version: "2026-10-30", Statement: [{ Effect: "Allow", Action: "studio:*", Resource: "*" }] } as IamPolicy["document"] };

class MemoryRepository implements IamRecordRepository {
  private readonly rows = new Map<string, IamRecordEnvelope>();
  private key(id: string, scope?: IamRecordScope): string {
    return `${scope?.domainId ?? ""}|${id}`;
  }
  async list(scope?: IamRecordScope): Promise<IamRecordEnvelope[]> {
    return [...this.rows.values()].filter((row) => (row.scope.domainId ?? null) === (scope?.domainId ?? null));
  }
  async get(id: string, scope?: IamRecordScope): Promise<IamRecordEnvelope | null> {
    return this.rows.get(this.key(id, scope)) ?? null;
  }
  async put(record: IamRecordEnvelope): Promise<IamRecordEnvelope> {
    this.rows.set(this.key(record.id, record.scope), structuredClone(record));
    return record;
  }
  async delete(id: string, scope?: IamRecordScope): Promise<boolean> {
    return this.rows.delete(this.key(id, scope));
  }
}

describe("IAM store changes", () => {
  const stops: Array<() => void> = [];
  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
  });

  it("announces each successful write with its workspace, and nothing for a read or a refused write", async () => {
    const heard: Array<string | null> = [];
    stops.push(iamStoreChanges.subscribe((workspaceId) => heard.push(workspaceId)));
    const store = new IamStore({ workspaceId: "w1", repository: new MemoryRepository(), resolveManagedPolicy: (name) => (name === USER_ACCESS.name ? USER_ACCESS : null) });
    const user = store.principalFrn("user", "u1");

    await store.attachPolicy(user, "FluxIQUserAccess", CONTEXT);
    await store.listAttachedPolicies(user);
    await expect(store.attachPolicy(user, "FluxIQUserAccess", CONTEXT)).rejects.toThrow();
    await store.detachPolicy(user, "FluxIQUserAccess", CONTEXT);

    expect(heard).toEqual(["w1", "w1"]);
  });

  it("tells a listener nothing once it is removed, and keeps telling the others when one throws", async () => {
    const heard: string[] = [];
    stops.push(iamStoreChanges.subscribe(() => {
      throw new Error("listener failed");
    }));
    const stop = iamStoreChanges.subscribe(() => heard.push("removed"));
    stops.push(iamStoreChanges.subscribe(() => heard.push("kept")));
    stop();

    iamStoreChanges.announce("w1");

    expect(heard).toEqual(["kept"]);
  });
});
