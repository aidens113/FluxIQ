import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { latestLinkToken } from "./provisioning-fixture.ts";
import { accountWithPassword, boot, captureConsole, digestOf, EMAIL, enableTwoFactor, NEW_PASSWORD, OLD_PASSWORD, restartRows as rows, signsInWith, type RestartRows } from "./restart-fixture.ts";

// Welcome and reset links with the real identity-access service over a
// stored repository, across a simulated restart (`restart-fixture.ts`): a new
// service over the same rows holds every credential sealed and not unlocked,
// which is where the plain `setPassword` refuses ("Credential recheck
// required"). A link is the authority for the new password, so it must still
// work; a failure while setting it must leave the link usable; a used or
// expired link stays refused; and no token, digest or password reaches a log
// or the audit.

let logged: string[] = [];

beforeEach(() => {
  logged = captureConsole();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Nothing secret in what was logged, in the audit rows, or (for the token and passwords) in any stored row. */
function expectNothingSecret(shared: RestartRows, token: string): void {
  const outside = JSON.stringify([logged, shared.audit.records]);
  for (const secret of [token, digestOf(token), OLD_PASSWORD, NEW_PASSWORD]) expect(outside).not.toContain(secret);
  const stored = JSON.stringify([shared.platform.snapshot(), shared.identity.snapshot()]);
  for (const secret of [token, OLD_PASSWORD, NEW_PASSWORD]) expect(stored).not.toContain(secret);
}

describe("account links across a restart", () => {
  it("a reset link sets the password on a credential sealed before the restart, once", async () => {
    const shared = rows();
    const userId = await accountWithPassword(await boot(shared), false);
    const server = await boot(shared);
    // The cause: the plain path cannot replace a sealed credential without the old password.
    await expect(server.identity.setPassword(userId, NEW_PASSWORD)).rejects.toThrow("Credential recheck required");

    await server.services.links.requestReset({ email: EMAIL });
    const token = latestLinkToken(shared.email, "resetUrl");
    expect(await server.services.links.redeemReset({ token, password: NEW_PASSWORD })).toEqual({ ok: true, redemption: { userId, email: EMAIL, continueUrl: null } });
    expect(await signsInWith(server, NEW_PASSWORD)).toBe(true);
    expect(await signsInWith(server, OLD_PASSWORD)).toBe(false);
    const later = await boot(shared);
    expect(await signsInWith(later, NEW_PASSWORD)).toBe(true);

    expect(await later.services.links.redeemReset({ token, password: OLD_PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    expect(await signsInWith(later, NEW_PASSWORD)).toBe(true);
    expectNothingSecret(shared, token);
  });

  it("a welcome link sets the password on a credential sealed before the restart, and verifies the email", async () => {
    const shared = rows();
    const userId = await accountWithPassword(await boot(shared), true);
    const token = latestLinkToken(shared.email, "welcomeUrl");
    const server = await boot(shared);

    expect(await server.services.links.redeemWelcome({ token, password: NEW_PASSWORD })).toEqual({ ok: true, redemption: { userId, email: EMAIL, continueUrl: null } });
    expect(await signsInWith(server, NEW_PASSWORD)).toBe(true);
    expect((await server.services.store.getAccount(userId))?.emailVerifiedAtMs).toBe(shared.clock.nowMs);
    expect(await server.services.links.redeemWelcome({ token, password: NEW_PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    expectNothingSecret(shared, token);
  });

  it("records the redemption as one allow of SetAccountPassword citing the link", async () => {
    const shared = rows();
    const userId = await accountWithPassword(await boot(shared), false);
    const server = await boot(shared);
    await server.services.links.requestReset({ email: EMAIL });
    const before = shared.audit.records.length;
    await server.services.links.redeemReset({ token: latestLinkToken(shared.email, "resetUrl"), password: NEW_PASSWORD });

    const added = shared.audit.records.slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      category: "allow",
      action: "platform:SetAccountPassword",
      resources: [`frn:fluxiq:platform::account/${userId}`],
      decision: "allow",
      matched: { policy: "reset-link", sid: null },
      origin: "provisioning"
    });
    expect(added[0]?.principal).toMatch(new RegExp(`/${userId}$`, "u"));
  });

  it("a failure while setting the password leaves the link usable, even across another restart", async () => {
    const shared = rows();
    const userId = await accountWithPassword(await boot(shared), false);
    const server = await boot(shared);
    await server.services.links.requestReset({ email: EMAIL });
    const token = latestLinkToken(shared.email, "resetUrl");
    vi.spyOn(server.identity, "resetPassword").mockRejectedValueOnce(new Error("identity store unavailable"));

    await expect(server.services.links.redeemReset({ token, password: NEW_PASSWORD })).rejects.toThrow("identity store unavailable");
    expect((await server.services.store.getLinkToken(digestOf(token)))?.usedAtMs).toBeNull();
    expect(await signsInWith(server, OLD_PASSWORD)).toBe(true);

    const restarted = await boot(shared);
    expect((await restarted.services.links.redeemReset({ token, password: NEW_PASSWORD })).ok).toBe(true);
    expect(await signsInWith(restarted, NEW_PASSWORD)).toBe(true);
    expect(await restarted.services.links.redeemReset({ token, password: NEW_PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    expect((await restarted.services.store.getAccount(userId))?.status).toBe("active");
    expectNothingSecret(shared, token);
  });

  it("a failure after the password is set (revoking the sessions) also leaves the link usable", async () => {
    const shared = rows();
    await accountWithPassword(await boot(shared), true);
    const token = latestLinkToken(shared.email, "welcomeUrl");
    const server = await boot(shared);
    vi.spyOn(server.identity, "revokeUserSessions").mockRejectedValueOnce(new Error("session store unavailable"));

    await expect(server.services.links.redeemWelcome({ token, password: NEW_PASSWORD })).rejects.toThrow("session store unavailable");
    expect((await server.services.store.getLinkToken(digestOf(token)))?.usedAtMs).toBeNull();
    expect((await server.services.links.redeemWelcome({ token, password: NEW_PASSWORD })).ok).toBe(true);
    expect(await server.services.links.redeemWelcome({ token, password: NEW_PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    expectNothingSecret(shared, token);
  });

  it("a link cannot reset a sealed account with two-factor sign-in, and the link stays unused", async () => {
    const shared = rows();
    const before = await boot(shared);
    const userId = await accountWithPassword(before, false);
    await enableTwoFactor(before, userId);
    const server = await boot(shared);
    await server.services.links.requestReset({ email: EMAIL });
    const token = latestLinkToken(shared.email, "resetUrl");
    const audited = shared.audit.records.length;

    expect(await server.services.links.redeemReset({ token, password: NEW_PASSWORD })).toEqual({ ok: false, code: "two_factor" });
    expect((await server.services.store.getLinkToken(digestOf(token)))?.usedAtMs).toBeNull();
    expect(shared.audit.records.length).toBe(audited);
    expect((await server.identity.authenticate({ username: EMAIL, password: OLD_PASSWORD })).user.totpEnabled).toBe(true);
    expect(await signsInWith(server, NEW_PASSWORD)).toBe(false);
    expectNothingSecret(shared, token);
  });

  it("an expired link is refused after a restart and changes nothing", async () => {
    const shared = rows();
    await accountWithPassword(await boot(shared), false);
    const first = await boot(shared);
    await first.services.links.requestReset({ email: EMAIL });
    const token = latestLinkToken(shared.email, "resetUrl");
    shared.clock.advance(3600_000);
    const server = await boot(shared);

    expect(await server.services.links.redeemReset({ token, password: NEW_PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    expect(await signsInWith(server, OLD_PASSWORD)).toBe(true);
    expect(await signsInWith(server, NEW_PASSWORD)).toBe(false);
    expectNothingSecret(shared, token);
  });
});
