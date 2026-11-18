// Covers directory-changes.ts through the identity service that feeds it: a person disabled, removed or moved to
// another role, and a role's permissions changed, are each announced; a login, which also stores, is not.
import { describe, expect, it } from "vitest";
import { IdentityAccessService } from "../../service.ts";

async function watchedService() {
  const identity = new IdentityAccessService();
  await identity.upsertUser({ id: "alice", username: "alice", displayName: "Alice", roleId: "viewer", password: "correct horse battery" });
  let told = 0;
  const stop = identity.directoryChanges.subscribe(() => {
    told += 1;
  });
  return { identity, told: () => told, stop };
}

describe("identity directory changes", () => {
  it("announces a person disabled, moved to another role, or removed, and a role's permissions changed", async () => {
    const { identity, told } = await watchedService();

    await identity.updateUser({ id: "alice", enabled: false });
    expect(told()).toBe(1);
    await identity.updateUser({ id: "alice", enabled: true, roleId: "admin" });
    expect(told()).toBe(2);
    await identity.upsertRole({ id: "viewer", permissions: [] });
    expect(told()).toBe(3);
    await identity.deleteUser("alice");
    expect(told()).toBe(4);
  });

  it("announces nothing for a login, a display name, or once the listener stopped", async () => {
    const { identity, told, stop } = await watchedService();

    await identity.authenticate({ username: "alice", password: "correct horse battery" });
    await identity.updateUser({ id: "alice", displayName: "Alice A." });
    expect(told()).toBe(0);

    stop();
    await identity.updateUser({ id: "alice", enabled: false });
    expect(told()).toBe(0);
  });
});
