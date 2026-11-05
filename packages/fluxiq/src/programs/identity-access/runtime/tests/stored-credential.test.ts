// Identity Access: an account whose user row went missing while its credential stayed stored.
// Making it again takes no password or PIN, since that would replace a credential with no change
// event, so nothing would lock and no session would end. Every password and PIN here is a dummy.

import { describe, expect, it } from "vitest";
import type { RecordEnvelope, Repository } from "../../../database-manager/index.ts";
import { IdentityAccessService } from "../service.ts";

const PASSWORD = "dummy-password";
const NEW_PASSWORD = "dummy-password-changed";
const PIN = "4321";

class MemoryIdentityRepository implements Repository {
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

function createService(repository: MemoryIdentityRepository): IdentityAccessService {
  return new IdentityAccessService({ repository, passwordKdf: { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } } });
}

describe("IdentityAccessService an account whose user row went missing", () => {
  it("cannot be made again with a chosen password over the credential still stored", async () => {
    const repository = new MemoryIdentityRepository();
    await createService(repository).upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    await repository.delete("user:user.one");
    const identity = createService(repository);
    await expect(identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: NEW_PASSWORD })).rejects.toThrow("stored credential");
    await expect(identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", pin: PIN })).rejects.toThrow("stored credential");
    await expect(identity.authenticate({ username: "user-one", password: NEW_PASSWORD })).rejects.toThrow();
  });

  it("nor by the instance that still holds it open, after a reload forgets the account", async () => {
    const repository = new MemoryIdentityRepository();
    const identity = createService(repository);
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    await repository.delete("user:user.one");
    await identity.revokeUserSessions("user.one");
    await expect(identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: NEW_PASSWORD })).rejects.toThrow("stored credential");
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin" });
    await expect(identity.authenticate({ username: "user-one", password: PASSWORD })).resolves.toMatchObject({ user: { id: "user.one" } });
  });

  it("nor over an old row stored unsealed", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.put({ id: "credential:user.old", kind: "identity.users", scope: {}, data: { stateKind: "credential", recordType: "credential", credential: { userId: "user.old", updatedAtMs: 1 } }, createdAtMs: 1, updatedAtMs: 1 });
    await expect(createService(repository).upsertUser({ id: "user.old", username: "user-old", displayName: "User Old", roleId: "admin", password: NEW_PASSWORD })).rejects.toThrow("stored credential");
  });

  it("can be made again with no password, which changes no credential", async () => {
    const repository = new MemoryIdentityRepository();
    await createService(repository).upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    await repository.delete("user:user.one");
    const identity = createService(repository);
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin" });
    await expect(identity.authenticate({ username: "user-one", password: PASSWORD })).resolves.toMatchObject({ user: { id: "user.one" } });
  });

  it("a person deleted the proper way can be made again", async () => {
    const repository = new MemoryIdentityRepository();
    const identity = createService(repository);
    await identity.upsertUser({ id: "user.admin", username: "user-admin", displayName: "Admin", roleId: "admin", password: PASSWORD });
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    await identity.deleteUser("user.one");
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: NEW_PASSWORD });
    await expect(identity.authenticate({ username: "user-one", password: NEW_PASSWORD })).resolves.toMatchObject({ user: { id: "user.one" } });
  });
});
