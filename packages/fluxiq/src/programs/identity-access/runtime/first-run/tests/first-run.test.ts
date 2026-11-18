import { describe, expect, it } from "vitest";
import type { ScryptParameters } from "../../../../_shared/password-kdf/index.ts";
import type { RecordEnvelope, Repository } from "../../../../database-manager/index.ts";
import { IdentityAccessService } from "../../service.ts";

// What an identity store starts with, and the first-run state a host reads
// from it. Every password here is a dummy value.

const WEAK: ScryptParameters = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 };
const WEAK_KDF = { testOnlyWeakParameters: WEAK };
const OWNER_PASSWORD = "dummy-owner-password";

class MemoryRepository implements Repository {
  readonly records = new Map<string, RecordEnvelope>();
  async list(): Promise<RecordEnvelope[]> {
    return [...this.records.values()].map((item) => structuredClone(item));
  }
  async get(id: string): Promise<RecordEnvelope | null> {
    const item = this.records.get(id);
    return item ? structuredClone(item) : null;
  }
  async put(item: RecordEnvelope): Promise<RecordEnvelope> {
    this.records.set(item.id, structuredClone(item));
    return item;
  }
  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}

function service(repository: Repository = new MemoryRepository()): IdentityAccessService {
  return new IdentityAccessService({ repository, passwordKdf: WEAK_KDF });
}

describe("identity first run", () => {
  it("by default starts an empty store with the default admin on its temporary password", async () => {
    const identity = service();
    expect(await identity.firstRun.state()).toBe("temporary-admin");
    const signedIn = await identity.authenticate({ username: "admin", password: "admin" });
    expect(signedIn.user.id).toBe("admin");
    // Proving the state minted no session of its own: only the sign-in's.
    expect((await identity.snapshot()).sessions).toHaveLength(1);
  });

  it("started unclaimed, an empty store has no account and the temporary password opens nothing", async () => {
    const repository = new MemoryRepository();
    const identity = service(repository);
    expect(identity.firstRun.startUnclaimed()).toBe(true);
    expect(await identity.firstRun.state()).toBe("unclaimed");
    expect((await identity.snapshot()).users).toEqual([]);
    await expect(identity.authenticate({ username: "admin", password: "admin" })).rejects.toThrow("Invalid username or credentials");
    expect(repository.records.size).toBe(0);
    // A reload from the store seeds nothing either.
    await identity.revokeUserSessions("nobody");
    expect((await identity.snapshot()).users).toEqual([]);
  });

  it("cannot start unclaimed once loaded, so an existing store is never emptied", async () => {
    const identity = service();
    await identity.snapshot();
    expect(identity.firstRun.startUnclaimed()).toBe(false);
    expect(await identity.firstRun.state()).toBe("temporary-admin");
  });

  it("an existing store keeps its temporary admin when the host starts unclaimed", async () => {
    const repository = new MemoryRepository();
    await service(repository).snapshot();
    const reopened = service(repository);
    expect(reopened.firstRun.startUnclaimed()).toBe(true);
    expect(await reopened.firstRun.state()).toBe("temporary-admin");
  });

  it("is claimed once the owner exists, or once the admin's password is replaced or the admin is disabled", async () => {
    const created = service();
    created.firstRun.startUnclaimed();
    await created.upsertUser({ username: "owner", displayName: "Owner", roleId: "admin", password: OWNER_PASSWORD });
    expect(await created.firstRun.state()).toBe("claimed");

    const replaced = service();
    await replaced.setPassword("admin", OWNER_PASSWORD);
    expect(await replaced.firstRun.state()).toBe("claimed");

    const disabled = service();
    await disabled.upsertUser({ username: "second", displayName: "Second", roleId: "admin", password: OWNER_PASSWORD });
    await disabled.updateUser({ id: "admin", enabled: false });
    expect(await disabled.firstRun.state()).toBe("claimed");
  });
});
