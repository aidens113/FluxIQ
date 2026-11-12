// A person's starting humanness as the identity service keeps it: on their User record, stored
// with it and read back by a fresh service, carried by their own session (`validateSession`,
// `authenticate`), refused outside 0-100, and dropped when a stored record holds an invalid one.
// Every password here is a dummy value, and derivations run at the test-only N=2^10.

import { describe, expect, it } from "vitest";
import type { RecordEnvelope, Repository } from "../../../database-manager/index.ts";
import { IdentityAccessService } from "../service.ts";

const WEAK = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const;
const PASSWORD = "dummy-password";

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

const serviceOver = (repository?: Repository) => new IdentityAccessService({ passwordKdf: { testOnlyWeakParameters: WEAK }, ...(repository ? { repository } : {}) });

async function withPerson(repository?: Repository) {
  const service = serviceOver(repository);
  await service.upsertUser({ id: "person.one", username: "person-one", displayName: "Person One", roleId: "viewer", password: PASSWORD });
  return service;
}

describe("IdentityAccessService starting humanness", () => {
  it("comes back with the person's own session and sign-in, and goes when cleared", async () => {
    const service = await withPerson();
    const login = await service.authenticate({ username: "person-one", password: PASSWORD });
    expect(login.user).not.toHaveProperty("startingHumanness");
    await service.preferences.setStartingHumanness("person.one", 65);
    expect((await service.validateSession(login.session.id))?.user.startingHumanness).toBe(65);
    expect((await service.authenticate({ username: "person-one", password: PASSWORD })).user.startingHumanness).toBe(65);
    await service.preferences.setStartingHumanness("person.one", null);
    expect((await service.validateSession(login.session.id))?.user).not.toHaveProperty("startingHumanness");
    expect(await service.preferences.startingHumanness("person.one")).toBeNull();
  });

  it("is stored with the user and read back by a fresh service over the same store", async () => {
    const repository = new MemoryRepository();
    const first = await withPerson(repository);
    await first.preferences.setStartingHumanness("person.one", 0);
    expect(repository.records.get("user:person.one")?.data.user).toMatchObject({ startingHumanness: 0 });
    const second = serviceOver(repository);
    expect(await second.preferences.startingHumanness("person.one")).toBe(0);
    const login = await second.authenticate({ username: "person-one", password: PASSWORD });
    expect((await second.validateSession(login.session.id))?.user.startingHumanness).toBe(0);
  });

  it("keeps the value through an administrator's edits of the account", async () => {
    const service = await withPerson();
    await service.preferences.setStartingHumanness("person.one", 80);
    await service.updateUser({ id: "person.one", displayName: "Renamed" });
    await service.upsertUser({ id: "person.one", username: "person-one", displayName: "Again", roleId: "viewer" });
    expect(await service.preferences.startingHumanness("person.one")).toBe(80);
  });

  it("drops a stored value that is not a whole number from 0 to 100", async () => {
    for (const stored of [101, -1, 2.5, "40", null]) {
      const repository = new MemoryRepository();
      const first = await withPerson(repository);
      await first.preferences.setStartingHumanness("person.one", 50);
      const record = repository.records.get("user:person.one")!;
      (record.data.user as Record<string, unknown>).startingHumanness = stored;
      const second = serviceOver(repository);
      expect(await second.preferences.startingHumanness("person.one")).toBeNull();
    }
  });

  it("refuses a value outside 0-100 or not whole, and an unknown or disabled person, changing nothing", async () => {
    const service = await withPerson();
    await service.preferences.setStartingHumanness("person.one", 20);
    for (const value of [101, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(service.preferences.setStartingHumanness("person.one", value)).rejects.toThrow(/0 to 100/);
    }
    await expect(service.preferences.setStartingHumanness("person.nobody", 10)).rejects.toThrow(/Unknown or disabled user/);
    expect(await service.preferences.startingHumanness("person.nobody")).toBeNull();
    await service.upsertUser({ id: "person.two", username: "person-two", displayName: "Two", roleId: "viewer", enabled: false });
    await expect(service.preferences.setStartingHumanness("person.two", 10)).rejects.toThrow(/Unknown or disabled user/);
    expect(await service.preferences.startingHumanness("person.one")).toBe(20);
  });
});
