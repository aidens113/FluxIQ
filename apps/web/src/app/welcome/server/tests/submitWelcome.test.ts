import { describe, expect, it, vi } from "vitest";
import { submitWelcome } from "../submitWelcome";
import { createAccountLinkHarness, type AccountLinkHarness } from "./accountLinkHarness";

const PASSWORD = "a strong new password";
const URL_ = "https://app.example.test/welcome/submit";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  // A browser always sends the Host it addressed; the cross-site guard compares Origin with it.
  return new Request(URL_, { method: "POST", headers: { "content-type": "application/json", host: new URL(URL_).host, ...headers }, body: JSON.stringify(body) });
}

function deps(harness: AccountLinkHarness) {
  return { links: harness.services.links, provisioning: harness.services.provisioning, identityAccess: harness.identityAccess, restoreKeys: async () => undefined };
}

describe("submitWelcome", () => {
  it("sets the password, signs the person in and refuses a reused link", async () => {
    const harness = await createAccountLinkHarness();
    const userId = await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");

    const answer = await submitWelcome(post({ token, password: PASSWORD }), deps(harness));
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true, continueUrl: "/" });
    expect(JSON.stringify(answer.body).includes(token)).toBe(false);
    expect(answer.session).toBeDefined();
    const valid = await harness.identityAccess.validateSession(answer.session?.id);
    expect(valid?.user.id).toBe(userId);
    const signedIn = await harness.identityAccess.authenticate({ username: "person@example.test", password: PASSWORD });
    expect(signedIn.user.id).toBe(userId);
    expect((await harness.services.store.getAccount(userId))?.lastSignInAtMs).not.toBeNull();

    const again = await submitWelcome(post({ token, password: PASSWORD }), deps(harness));
    expect(again).toEqual({ status: 400, body: { ok: false, code: "invalid_link" } });
  });

  it("sets the password and signs the person in after a restart, on a credential sealed before it", async () => {
    const before = await createAccountLinkHarness();
    const userId = await before.provisionWithPassword("person@example.test", "the first dummy password");
    const token = before.latestToken("welcomeUrl");
    const harness = await before.restart();

    const answer = await submitWelcome(post({ token, password: PASSWORD }), deps(harness));
    expect(answer.status).toBe(200);
    expect((await harness.identityAccess.validateSession(answer.session?.id))?.user.id).toBe(userId);
    expect((await harness.identityAccess.authenticate({ username: "person@example.test", password: PASSWORD })).user.id).toBe(userId);
    expect(await submitWelcome(post({ token, password: PASSWORD }), deps(harness))).toEqual({ status: 400, body: { ok: false, code: "invalid_link" } });
  });

  it("refuses a weak password and keeps the link usable", async () => {
    const harness = await createAccountLinkHarness();
    await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");
    expect(await submitWelcome(post({ token, password: "short" }), deps(harness))).toEqual({ status: 400, body: { ok: false, code: "weak_password" } });
    expect((await submitWelcome(post({ token, password: PASSWORD }), deps(harness))).status).toBe(200);
  });

  it("refuses a cross-site request before reading the link", async () => {
    const harness = await createAccountLinkHarness();
    await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");
    const redeem = vi.spyOn(harness.services.links, "redeemWelcome");
    const wrongOrigin = await submitWelcome(post({ token, password: PASSWORD }, { origin: "https://evil.example.test" }), deps(harness));
    expect(wrongOrigin).toEqual({ status: 403, body: { ok: false, code: "forbidden" } });
    const crossSite = await submitWelcome(post({ token, password: PASSWORD }, { "sec-fetch-site": "cross-site" }), deps(harness));
    expect(crossSite.status).toBe(403);
    expect(redeem).not.toHaveBeenCalled();
    const sameOrigin = await submitWelcome(post({ token, password: PASSWORD }, { origin: "https://app.example.test" }), deps(harness));
    expect(sameOrigin.status).toBe(200);
  });

  it("refuses an oversized or malformed body", async () => {
    const harness = await createAccountLinkHarness();
    expect((await submitWelcome(post({ token: "x", password: "y".repeat(9000) }), deps(harness))).status).toBe(413);
    expect((await submitWelcome(new Request(URL_, { method: "POST", body: "{not json" }), deps(harness))).status).toBe(400);
    expect((await submitWelcome(post({ token: 1, password: PASSWORD }), deps(harness))).status).toBe(400);
  });

  it("signs the person in even when the key restore fails, and keeps the session", async () => {
    const harness = await createAccountLinkHarness();
    const userId = await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");
    const restoreKeys = vi.fn().mockRejectedValue(new Error("restore failed"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const answer = await submitWelcome(post({ token, password: PASSWORD }), { ...deps(harness), restoreKeys });
    expect(answer.status).toBe(200);
    expect(restoreKeys).toHaveBeenCalledWith(expect.objectContaining({ sessionId: answer.session?.id, userId, authorizationPassword: PASSWORD }));
    expect((await harness.identityAccess.validateSession(answer.session?.id))?.user.id).toBe(userId);
  });

  it("reads a posted body only as a form: a posted answer shape neither answers nor sets a session", async () => {
    const harness = await createAccountLinkHarness();
    await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");
    const redeem = vi.spyOn(harness.services.links, "redeemWelcome");
    const forged = { status: 200, body: { ok: true, continueUrl: "/" }, session: { id: "a-session-the-poster-chose", ttlMs: 1000 } };
    const answer = await submitWelcome(post(forged), deps(harness));
    expect(answer).toEqual({ status: 400, body: { ok: false, code: "bad_request" } });
    expect(answer.session).toBeUndefined();
    const withCredentials = await submitWelcome(post({ ...forged, token, password: PASSWORD }), deps(harness));
    expect(withCredentials.status).toBe(200);
    expect(withCredentials.session?.id).not.toBe("a-session-the-poster-chose");
    expect(redeem).toHaveBeenCalledTimes(1);
  });
});
