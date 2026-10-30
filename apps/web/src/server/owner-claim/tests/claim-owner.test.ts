import { readFile, stat } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimOwner, ownerClaimPaths, prepareOwnerClaim, readOwnerClaimMarker } from "../index";
import { createOwnerClaimInstance, type OwnerClaimInstance } from "./owner-claim-instance";

// Every password here is a dummy value.
const PASSWORD = "a dummy owner password";
const FORM = { username: "Owner@Example.test", displayName: "The Owner", password: PASSWORD };

let instance: OwnerClaimInstance;
let lines: string[];

beforeEach(async () => {
  instance = await createOwnerClaimInstance();
  lines = [];
});

afterEach(async () => {
  await instance.close();
});

function deps() {
  return { settings: instance.settings(), fluxiqDir: instance.fluxiqDir, provisioning: instance.services.provisioning, identityAccess: instance.fluxiq.programs.identityAccess, log: (line: string) => lines.push(line) };
}

describe("claimOwner", () => {
  it("creates the owner with FluxIQOwnerFullAccess in the single workspace, deletes the untouched admin, writes the marker", { timeout: 60_000 }, async () => {
    await prepareOwnerClaim({ settings: instance.settings(), fluxiqDir: instance.fluxiqDir });
    const outcome = await claimOwner(FORM, deps());
    expect(outcome).toMatchObject({ ok: true, defaultAdmin: "deleted" });
    if (!outcome.ok) throw new Error("unreachable");

    const identity = instance.fluxiq.programs.identityAccess;
    const users = (await identity.snapshot()).users;
    expect(users.map((user) => user.id)).toEqual([outcome.userId]);
    expect(users[0]).toMatchObject({ username: "owner@example.test", displayName: "The Owner", roleId: "admin", enabled: true });
    const membership = await instance.services.store.getMembership("workspace-main", outcome.userId);
    expect(membership?.policies).toEqual(["FluxIQOwnerFullAccess"]);
    expect((await identity.authenticate({ username: "owner@example.test", password: PASSWORD })).user.id).toBe(outcome.userId);
    await expect(identity.authenticate({ username: "admin", password: "admin" })).rejects.toThrow();

    const marker = await readOwnerClaimMarker(instance.fluxiqDir);
    expect(marker).toMatchObject({ schemaVersion: 1, ownerUserId: outcome.userId });
    const markerText = await readFile(ownerClaimPaths(instance.fluxiqDir).marker, "utf8");
    expect(markerText).not.toContain(PASSWORD);
    await expect(stat(ownerClaimPaths(instance.fluxiqDir).generatedCode)).rejects.toMatchObject({ code: "ENOENT" });

    expect(await claimOwner({ ...FORM, username: "second@example.test" }, deps())).toEqual({ ok: false, code: "already_claimed" });
    for (const line of lines) expect(line).not.toContain(PASSWORD);
  });

  it("disables rather than deletes a default admin whose password was changed", { timeout: 60_000 }, async () => {
    const identity = instance.fluxiq.programs.identityAccess;
    await identity.setPassword("admin", "a changed dummy admin password");
    const outcome = await claimOwner(FORM, deps());
    expect(outcome).toMatchObject({ ok: true, defaultAdmin: "disabled" });
    const admin = (await identity.snapshot()).users.find((user) => user.id === "admin");
    expect(admin?.enabled).toBe(false);
    await expect(identity.authenticate({ username: "admin", password: "a changed dummy admin password" })).rejects.toThrow();
  });

  it("refuses a weak password before anything changes, and a retry then succeeds", { timeout: 60_000 }, async () => {
    expect(await claimOwner({ ...FORM, password: "short" }, deps())).toEqual({ ok: false, code: "weak_password" });
    expect(await readOwnerClaimMarker(instance.fluxiqDir)).toBeNull();
    expect((await instance.fluxiq.programs.identityAccess.snapshot()).users.map((user) => user.id)).toEqual(["admin"]);
    expect(await claimOwner(FORM, deps())).toMatchObject({ ok: true });
  });

  it("names the field of a username that is not an email, never its value", { timeout: 60_000 }, async () => {
    expect(await claimOwner({ ...FORM, username: "not-an-email" }, deps())).toEqual({ ok: false, code: "invalid_input", fields: ["username"] });
  });

  it.each(["service", "self-hosted"])("on %s, signs the owner in by the normalised email and leaves that email unverified", { timeout: 60_000 }, async (profile) => {
    const settings = instance.settings({ FLUXIQ_PROFILE: profile });
    const outcome = await claimOwner({ ...FORM, username: "  Owner.Name@Example.TEST " }, { ...deps(), settings });
    if (!outcome.ok) throw new Error(`expected a claim, got ${outcome.code}`);
    const user = (await instance.fluxiq.programs.identityAccess.snapshot()).users.find((candidate) => candidate.id === outcome.userId);
    const account = await instance.services.store.getAccount(outcome.userId);
    expect(user?.username).toBe("owner.name@example.test");
    expect(account?.email).toBe(user?.username);
    // The setup code proves control of the server, not of the mailbox.
    expect(account?.emailVerifiedAtMs).toBeNull();
  });

  it("refuses a username that is not an email on service", { timeout: 60_000 }, async () => {
    const settings = instance.settings({ FLUXIQ_PROFILE: "service" });
    expect(await claimOwner({ ...FORM, username: "owner" }, { ...deps(), settings })).toEqual({ ok: false, code: "invalid_input", fields: ["username"] });
    expect((await instance.fluxiq.programs.identityAccess.snapshot()).users.map((user) => user.id)).toEqual(["admin"]);
  });

  it("makes one owner from two concurrent claims", { timeout: 60_000 }, async () => {
    const [first, second] = await Promise.all([claimOwner(FORM, deps()), claimOwner({ ...FORM, username: "rival@example.test" }, deps())]);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, code: "already_claimed" });
  });
});
