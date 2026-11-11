// IdentityAccessService sign-in names: a name another person already has,
// ignoring case, is refused when a person is created or renamed, on every
// caller's path (the endpoints and provisioning both write through the
// service); a person may re-case their own name, stored as sent; and two
// people stored before the rule with names that differ only by case are left
// as they are and can each still be updated. Every password is a dummy value;
// derivations run at the test-only N=2^10.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { RecordEnvelope, Repository } from "../../../database-manager/index.ts";
import { IdentityAccessService } from "../service.ts";
import { identityRecord } from "../stored-state.ts";
import { IdentityUsernameTakenError } from "../username-taken-error.ts";

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD = "dummy-password";
const OTHER_PASSWORD = "dummy-password-other";

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

async function freshService(): Promise<IdentityAccessService> {
  const service = new IdentityAccessService({ passwordKdf: WEAK_KDF });
  await service.upsertUser({ id: "ann", username: "ann", displayName: "Ann", roleId: "viewer", password: PASSWORD });
  await service.upsertUser({ id: "bob", username: "Bob", displayName: "Bob", roleId: "viewer" });
  return service;
}

/** A store holding "Ann" and "ann" (written before the rule existed), and a service loaded from it. */
async function storedDuplicates(): Promise<{ repository: MemoryRepository; service: IdentityAccessService }> {
  const repository = new MemoryRepository();
  const writer = new IdentityAccessService({ repository, passwordKdf: WEAK_KDF });
  await writer.upsertUser({ id: "first", username: "Ann", displayName: "First Ann", roleId: "viewer", password: PASSWORD });
  const second = await writer.upsertUser({ id: "second", username: "placeholder", displayName: "Second Ann", roleId: "viewer", password: OTHER_PASSWORD });
  await repository.put(identityRecord("user:second", "user", { recordType: "user", user: { ...second, username: "ann" } as unknown as JsonObject }, Date.now()));
  return { repository, service: new IdentityAccessService({ repository, passwordKdf: WEAK_KDF }) };
}

async function usernames(service: IdentityAccessService): Promise<Record<string, string>> {
  return Object.fromEntries((await service.snapshot()).users.map((user) => [user.id, user.username]));
}

describe("IdentityAccessService sign-in names", () => {
  it("refuses creating a person whose name another has in another case, and creates nothing", async () => {
    const service = await freshService();

    await expect(service.upsertUser({ id: "carol", username: "ANN", displayName: "Carol", roleId: "viewer" })).rejects.toBeInstanceOf(IdentityUsernameTakenError);
    await expect(service.upsertUser({ id: "carol", username: "bob", displayName: "Carol", roleId: "viewer" })).rejects.toMatchObject({ code: "identity.username_taken" });
    expect((await service.snapshot()).users.map((user) => user.id)).not.toContain("carol");
  });

  it("refuses renaming a person onto another's name in another case, and changes nothing", async () => {
    const service = await freshService();

    await expect(service.updateUser({ id: "bob", username: "Ann", displayName: "Renamed" })).rejects.toBeInstanceOf(IdentityUsernameTakenError);
    await expect(service.upsertUser({ id: "bob", username: "aNN", displayName: "Renamed", roleId: "viewer" })).rejects.toBeInstanceOf(IdentityUsernameTakenError);
    expect((await service.snapshot()).users.find((user) => user.id === "bob")).toMatchObject({ username: "Bob", displayName: "Bob" });
  });

  it("lets a person re-case their own name, stored as sent, and still signs them in by any case", async () => {
    const service = await freshService();

    await expect(service.updateUser({ id: "ann", username: "ANN" })).resolves.toMatchObject({ username: "ANN" });
    expect((await usernames(service)).ann).toBe("ANN");
    await expect(service.authenticate({ username: " ann ", password: PASSWORD })).resolves.toMatchObject({ user: { id: "ann" } });
  });

  it("checks nothing when an update writes no name", async () => {
    const service = await freshService();

    await expect(service.updateUser({ id: "bob", displayName: "Robert" })).resolves.toMatchObject({ username: "Bob", displayName: "Robert" });
  });
});

describe("IdentityAccessService with two people stored under names that differ only by case", () => {
  it("loads both as stored, rewriting neither", async () => {
    const { service } = await storedDuplicates();

    expect(await usernames(service)).toMatchObject({ first: "Ann", second: "ann" });
  });

  it("updates either when the name is not written, or is re-cased", async () => {
    const { service } = await storedDuplicates();

    await expect(service.updateUser({ id: "first", displayName: "Renamed First" })).resolves.toMatchObject({ username: "Ann", displayName: "Renamed First" });
    await expect(service.updateUser({ id: "second", roleId: "admin" })).resolves.toMatchObject({ username: "ann", roleId: "admin" });
    await expect(service.updateUser({ id: "second", username: "ANN" })).resolves.toMatchObject({ username: "ANN" });
  });

  it("lets one move to a free name, after which the other can no longer take it", async () => {
    const { service } = await storedDuplicates();

    await expect(service.updateUser({ id: "first", username: "anne" })).resolves.toMatchObject({ username: "anne" });
    await expect(service.updateUser({ id: "second", username: "Anne" })).rejects.toBeInstanceOf(IdentityUsernameTakenError);
    expect(await usernames(service)).toMatchObject({ first: "anne", second: "ann" });
  });

  it("refuses a third person the shared name in any case", async () => {
    const { service } = await storedDuplicates();

    await expect(service.upsertUser({ id: "third", username: "aNn", displayName: "Third", roleId: "viewer" })).rejects.toBeInstanceOf(IdentityUsernameTakenError);
  });

  it("signs in by name only the one stored first, as sign-in did before the rule", async () => {
    const { service } = await storedDuplicates();

    await expect(service.authenticate({ username: "ANN", password: PASSWORD })).resolves.toMatchObject({ user: { id: "first" } });
    await expect(service.authenticate({ username: "ann", password: OTHER_PASSWORD })).rejects.toThrow("Invalid username or credentials");
  });
});
