import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccountLinkHarness } from "../../welcome/server/tests/accountLinkHarness";
import { requestReset } from "../requestReset";
import { submitReset } from "../submitReset";

const OLD_PASSWORD = "the first password";
const NEW_PASSWORD = "the second password";

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://app.example.test${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("requestReset", () => {
  it("answers the same for a known and an unknown email, and mails only the known one", async () => {
    const harness = await createAccountLinkHarness();
    await harness.provision("person@example.test");
    const deps = { links: harness.services.links };
    const sentBefore = harness.email.messages.length;
    const known = await requestReset(post("/reset/request", { email: "Person@Example.test" }), deps);
    const sentAfterKnown = harness.email.messages.length;
    const unknown = await requestReset(post("/reset/request", { email: "nobody@example.test" }), deps);
    expect(known).toEqual({ status: 200, body: { ok: true } });
    expect(unknown).toEqual(known);
    expect(sentAfterKnown).toBe(sentBefore + 1);
    expect(harness.email.messages.length).toBe(sentAfterKnown);
  });

  it("refuses a cross-site request and a body without an email", async () => {
    const harness = await createAccountLinkHarness();
    const deps = { links: harness.services.links };
    expect((await requestReset(post("/reset/request", { email: "a@example.test" }, { origin: "https://evil.example.test" }), deps)).status).toBe(403);
    expect((await requestReset(post("/reset/request", {}), deps)).status).toBe(400);
  });
});

describe("submitReset", () => {
  it("sets the new password, ends the old sessions, and refuses a reused link", async () => {
    const harness = await createAccountLinkHarness();
    const deps = { links: harness.services.links };
    await harness.provision("person@example.test");
    await harness.services.links.redeemWelcome({ token: harness.latestToken("welcomeUrl"), password: OLD_PASSWORD });
    const oldSession = (await harness.identityAccess.authenticate({ username: "person@example.test", password: OLD_PASSWORD })).session;

    await requestReset(post("/reset/request", { email: "person@example.test" }), deps);
    const token = harness.latestToken("resetUrl");
    const answer = await submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }), deps);
    expect(answer).toEqual({ status: 200, body: { ok: true } });
    expect(answer.session).toBeUndefined();
    expect((await harness.identityAccess.authenticate({ username: "person@example.test", password: NEW_PASSWORD })).user.username).toBe("person@example.test");
    await expect(harness.identityAccess.authenticate({ username: "person@example.test", password: OLD_PASSWORD })).rejects.toThrow();
    expect(await harness.identityAccess.validateSession(oldSession.id)).toBeNull();

    expect(await submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }), deps)).toEqual({ status: 400, body: { ok: false, code: "invalid_link" } });
  });

  it("refuses a weak password, keeping the link, and a cross-site request", async () => {
    const harness = await createAccountLinkHarness();
    const deps = { links: harness.services.links };
    await harness.provision("person@example.test");
    await requestReset(post("/reset/request", { email: "person@example.test" }), deps);
    const token = harness.latestToken("resetUrl");
    expect(await submitReset(post("/reset/submit", { token, password: "short" }), deps)).toEqual({ status: 400, body: { ok: false, code: "weak_password" } });
    expect((await submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }, { "sec-fetch-site": "cross-site" }), deps)).status).toBe(403);
    expect((await submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }), deps)).status).toBe(200);
  });
});

describe("submitReset after a restart", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets the new password on a credential sealed before the restart, once, and logs nothing secret", async () => {
    const logged: unknown[][] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logged.push(args));
    const before = await createAccountLinkHarness();
    await before.provisionWithPassword("person@example.test", OLD_PASSWORD);
    const harness = await before.restart();
    const deps = { links: harness.services.links };

    await requestReset(post("/reset/request", { email: "person@example.test" }), deps);
    const token = harness.latestToken("resetUrl");
    expect(await submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }), deps)).toEqual({ status: 200, body: { ok: true } });
    expect((await harness.identityAccess.authenticate({ username: "person@example.test", password: NEW_PASSWORD })).user.username).toBe("person@example.test");
    await expect(harness.identityAccess.authenticate({ username: "person@example.test", password: OLD_PASSWORD })).rejects.toThrow();
    const later = await harness.restart();
    expect((await later.identityAccess.authenticate({ username: "person@example.test", password: NEW_PASSWORD })).user.username).toBe("person@example.test");
    expect(await submitReset(post("/reset/submit", { token, password: OLD_PASSWORD }), { links: later.services.links })).toEqual({ status: 400, body: { ok: false, code: "invalid_link" } });

    const text = JSON.stringify(logged);
    for (const secret of [token, OLD_PASSWORD, NEW_PASSWORD]) expect(text).not.toContain(secret);
  });

  it("refuses a sealed account with two-factor sign-in (403) and keeps the link unused", async () => {
    const before = await createAccountLinkHarness();
    const userId = await before.provisionWithPassword("person@example.test", OLD_PASSWORD);
    await before.identityAccess.upsertUser({ id: userId, username: "person@example.test", displayName: "A Person", roleId: "viewer", totpEnabled: true });
    const harness = await before.restart();
    const deps = { links: harness.services.links };
    await requestReset(post("/reset/request", { email: "person@example.test" }), deps);
    const token = harness.latestToken("resetUrl");

    expect(await submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }), deps)).toEqual({ status: 403, body: { ok: false, code: "two_factor" } });
    expect((await harness.identityAccess.authenticate({ username: "person@example.test", password: OLD_PASSWORD })).user.totpEnabled).toBe(true);
    await expect(harness.identityAccess.authenticate({ username: "person@example.test", password: NEW_PASSWORD })).rejects.toThrow();
  });

  it("keeps the link usable when setting the password fails", async () => {
    const before = await createAccountLinkHarness();
    await before.provisionWithPassword("person@example.test", OLD_PASSWORD);
    const harness = await before.restart();
    const deps = { links: harness.services.links };
    await requestReset(post("/reset/request", { email: "person@example.test" }), deps);
    const token = harness.latestToken("resetUrl");
    vi.spyOn(harness.identityAccess, "resetPassword").mockRejectedValueOnce(new Error("identity store unavailable"));

    await expect(submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }), deps)).rejects.toThrow("identity store unavailable");
    expect((await harness.identityAccess.authenticate({ username: "person@example.test", password: OLD_PASSWORD })).user.username).toBe("person@example.test");
    expect(await submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }), deps)).toEqual({ status: 200, body: { ok: true } });
    expect(await submitReset(post("/reset/submit", { token, password: NEW_PASSWORD }), deps)).toEqual({ status: 400, body: { ok: false, code: "invalid_link" } });
  });
});
