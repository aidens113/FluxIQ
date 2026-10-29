import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accountInput, createProvisioningHarness, latestLinkToken, type ProvisioningHarness } from "./provisioning-fixture.ts";

const PASSWORD = "a strong new password";

async function createdUser(harness: ProvisioningHarness, overrides: Record<string, unknown> = {}): Promise<string> {
  const answer = await harness.services.provisioning.run("createAccount", accountInput({ sendWelcome: true, ...overrides }), harness.http);
  if (!answer.ok || answer.result.status !== "created") throw new Error("expected created");
  return answer.result.userId;
}

describe("welcome links", () => {
  it("emails a 24-hour fragment link, stores only the digest, and redeems once", async () => {
    const harness = await createProvisioningHarness();
    const userId = await createdUser(harness);
    const message = harness.email.messages[0];
    expect(message?.variables.welcomeUrl).toMatch(/^https:\/\/app\.example\.test\/welcome#token=[A-Za-z0-9_-]{43}$/u);
    expect(message?.variables.expiresInHours).toBe("24");
    const token = latestLinkToken(harness.email, "welcomeUrl");
    const rows = JSON.stringify(await harness.repository.list({ domainId: null }));
    expect(rows).not.toContain(token);
    const digest = createHash("sha256").update(token).digest("hex");
    expect(await harness.services.store.getLinkToken(digest)).toMatchObject({ purpose: "welcome", userId, expiresAtMs: harness.clock.nowMs + 24 * 3600_000, usedAtMs: null });

    harness.identity.sessions.set(userId, 1);
    const redeemed = await harness.services.links.redeemWelcome({ token, password: PASSWORD });
    expect(redeemed).toEqual({ ok: true, redemption: { userId, email: "person@example.test", continueUrl: null } });
    expect(harness.identity.users.get(userId)?.password).toBe(PASSWORD);
    expect(harness.identity.sessions.get(userId)).toBe(0);
    expect((await harness.services.store.getAccount(userId))?.emailVerifiedAtMs).toBe(harness.clock.nowMs);

    expect(await harness.services.links.redeemWelcome({ token, password: PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
  });

  it("gives one answer for unknown, malformed, expired and wrong-purpose tokens", async () => {
    const harness = await createProvisioningHarness();
    await createdUser(harness);
    const token = latestLinkToken(harness.email, "welcomeUrl");
    expect(await harness.services.links.redeemWelcome({ token: "A".repeat(43), password: PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    expect(await harness.services.links.redeemWelcome({ token: "not a token", password: PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    expect(await harness.services.links.redeemReset({ token, password: PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    harness.clock.advance(24 * 3600_000);
    expect(await harness.services.links.redeemWelcome({ token, password: PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
  });

  it("keeps the token on a weak password or a disabled account, and a re-send supersedes it", async () => {
    const harness = await createProvisioningHarness();
    const userId = await createdUser(harness);
    const first = latestLinkToken(harness.email, "welcomeUrl");
    expect(await harness.services.links.redeemWelcome({ token: first, password: "short" })).toEqual({ ok: false, code: "weak_password" });

    await harness.services.provisioning.run("disableAccount", { requestId: "d1", userId, reason: "review" }, harness.http);
    expect(await harness.services.links.redeemWelcome({ token: first, password: PASSWORD })).toEqual({ ok: false, code: "disabled" });
    await harness.services.provisioning.run("enableAccount", { requestId: "e1", userId, reason: "cleared" }, harness.http);

    const resend = await harness.services.provisioning.run("sendWelcome", { requestId: "s1", userId }, harness.http);
    expect(resend).toEqual({ ok: true, result: { status: "accepted" } });
    const second = latestLinkToken(harness.email, "welcomeUrl");
    expect(second).not.toBe(first);
    expect(await harness.services.links.redeemWelcome({ token: first, password: PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
    expect((await harness.services.links.redeemWelcome({ token: second, password: PASSWORD })).ok).toBe(true);
  });

  it("keeps a same-origin /connect/authorize continueUrl and refuses any other as invalid_input", async () => {
    const harness = await createProvisioningHarness();
    const continueUrl = "/connect/authorize?client_id=ext&state=abc";
    await createdUser(harness, { continueUrl });
    const redeemed = await harness.services.links.redeemWelcome({ token: latestLinkToken(harness.email, "welcomeUrl"), password: PASSWORD });
    expect(redeemed.ok && redeemed.redemption.continueUrl).toBe(continueUrl);

    for (const bad of ["https://evil.test/connect/authorize", "/settings", "//evil.test/connect/authorize"]) {
      const answer = await harness.services.provisioning.run("createAccount", accountInput({ requestId: `bad-${bad.length}`, email: "b@example.test", continueUrl: bad }), harness.http);
      expect(answer.ok === false && answer.error.code).toBe("invalid_input");
    }
  });
});

describe("sendWelcome anti-enumeration", () => {
  it("answers accepted for unknown, verified and disabled accounts, mailing only what fits", async () => {
    const harness = await createProvisioningHarness();
    const userId = await createdUser(harness);
    const token = latestLinkToken(harness.email, "welcomeUrl");
    harness.email.clear();
    expect(await harness.services.provisioning.run("sendWelcome", { requestId: "s1", email: "nobody@example.test" }, harness.http)).toEqual({ ok: true, result: { status: "accepted" } });
    expect(harness.email.messages).toEqual([]);

    expect((await harness.services.links.redeemWelcome({ token, password: PASSWORD })).ok).toBe(true);
    expect(await harness.services.provisioning.run("sendWelcome", { requestId: "s3", userId }, harness.http)).toEqual({ ok: true, result: { status: "accepted" } });
    expect(harness.email.messages.map((message) => message.template)).toEqual(["account-exists"]);

    await harness.services.provisioning.run("disableAccount", { requestId: "d1", userId, reason: "review" }, harness.http);
    harness.email.clear();
    expect(await harness.services.provisioning.run("sendWelcome", { requestId: "s4", userId }, harness.http)).toEqual({ ok: true, result: { status: "accepted" } });
    expect(harness.email.messages).toEqual([]);
  });

  it("answers the same when the email cannot be sent, reporting the failure", async () => {
    const harness = await createProvisioningHarness();
    await harness.services.provisioning.run("createAccount", accountInput(), harness.http);
    harness.email.failNext();
    expect(await harness.services.provisioning.run("sendWelcome", { requestId: "s1", email: "person@example.test" }, harness.http)).toEqual({ ok: true, result: { status: "accepted" } });
    expect(harness.emailFailures).toEqual(["welcome"]);
  });
});

describe("password reset", () => {
  it("answers ok either way, mails a one-hour link to an active account, and redeems once", async () => {
    const harness = await createProvisioningHarness();
    const userId = await createdUser(harness);
    harness.email.clear();
    expect(await harness.services.links.requestReset({ email: "nobody@example.test" })).toEqual({ ok: true });
    expect(harness.email.messages).toEqual([]);
    expect(await harness.services.links.requestReset({ email: " PERSON@example.test " })).toEqual({ ok: true });
    expect(harness.email.messages.map((message) => message.template)).toEqual(["password-reset"]);
    expect(harness.email.messages[0]?.variables.expiresInMinutes).toBe("60");
    const token = latestLinkToken(harness.email, "resetUrl");
    expect(harness.email.messages[0]?.variables.resetUrl).toBe(`https://app.example.test/reset#token=${token}`);

    harness.identity.sessions.set(userId, 3);
    const redeemed = await harness.services.links.redeemReset({ token, password: PASSWORD });
    expect(redeemed.ok).toBe(true);
    expect(harness.identity.users.get(userId)?.password).toBe(PASSWORD);
    expect(harness.identity.sessions.get(userId)).toBe(0);
    expect(await harness.services.links.redeemReset({ token, password: PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
  });

  it("expires a reset link after an hour and sends nothing for a disabled account", async () => {
    const harness = await createProvisioningHarness();
    const userId = await createdUser(harness);
    await harness.services.links.requestReset({ email: "person@example.test" });
    const token = latestLinkToken(harness.email, "resetUrl");
    harness.clock.advance(3600_000);
    expect(await harness.services.links.redeemReset({ token, password: PASSWORD })).toEqual({ ok: false, code: "invalid_link" });

    await harness.services.provisioning.run("disableAccount", { requestId: "d1", userId, reason: "review" }, harness.http);
    harness.email.clear();
    expect(await harness.services.links.requestReset({ email: "person@example.test" })).toEqual({ ok: true });
    expect(harness.email.messages).toEqual([]);
  });
});
