import type { PlatformProvisioning, PlatformProvisioningErrorCode } from "fluxiq/platform";
import { describe, expect, it, vi } from "vitest";
import { createAccountLinkHarness } from "../../../welcome/server/tests/accountLinkHarness";
import { SIGNUP_TERMS_VERSION } from "../signupTermsVersion";
import { submitSignup } from "../submitSignup";

// The real platform services (memory rows, memory email) under the real
// identity service; every address and password here is a dummy value.

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.example.test/signup/submit", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

const form = (email: string, displayName = "A Person") => ({ email, displayName, termsVersion: SIGNUP_TERMS_VERSION });

describe("submitSignup", () => {
  it("creates a pending account in a new personal workspace with the terms version, and queues one welcome email", async () => {
    const harness = await createAccountLinkHarness();
    const deps = { provisioning: harness.services.provisioning };
    const answer = await submitSignup(post(form(" Person@Example.test ")), deps);
    expect(answer).toEqual({ status: 200, body: { ok: true } });

    const account = await harness.services.store.findAccountByEmail("person@example.test");
    expect(account).toMatchObject({ email: "person@example.test", displayName: "A Person", status: "active", emailVerifiedAtMs: null, termsVersion: SIGNUP_TERMS_VERSION, createdVia: "in-process" });
    const memberships = await harness.services.store.listMembershipsOfUser(account!.userId);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.policies).toEqual(["FluxIQAdministratorAccess"]);
    expect(await harness.services.store.getWorkspace(memberships[0]!.workspaceId)).toMatchObject({ kind: "personal", ownerUserId: account!.userId });

    expect(harness.email.messages).toHaveLength(1);
    expect(harness.email.messages[0]).toMatchObject({ template: "welcome", to: "person@example.test" });
    expect(harness.email.messages[0]?.variables.welcomeUrl).toMatch(/^https:\/\/app\.example\.test\/welcome#token=/u);
  });

  it("answers a second sign-up for the address the same, makes no second account, and mails the address instead", async () => {
    const harness = await createAccountLinkHarness();
    const deps = { provisioning: harness.services.provisioning };
    const first = await submitSignup(post(form("person@example.test")), deps);
    const userId = (await harness.services.store.findAccountByEmail("person@example.test"))!.userId;

    // Not yet activated: a fresh welcome link, to the same account.
    const second = await submitSignup(post(form("PERSON@example.test", "Someone Else")), deps);
    expect(second).toEqual(first);
    expect(await harness.services.store.listAccounts()).toHaveLength(1);
    expect((await harness.services.store.findAccountByEmail("person@example.test"))?.displayName).toBe("A Person");
    expect(harness.email.messages.map((message) => message.template)).toEqual(["welcome", "welcome"]);

    // Activated (the welcome link set the password): "you already have an account", with no token.
    const redeemed = await harness.services.links.redeemWelcome({ token: harness.latestToken("welcomeUrl"), password: "a long dummy password" });
    expect(redeemed.ok).toBe(true);
    const third = await submitSignup(post(form("person@example.test")), deps);
    expect(third).toEqual(first);
    expect(await harness.services.store.listAccounts()).toHaveLength(1);
    expect((await harness.services.store.findAccountByEmail("person@example.test"))?.userId).toBe(userId);
    const last = harness.email.messages.at(-1);
    expect(last).toMatchObject({ template: "account-exists", to: "person@example.test" });
    expect(Object.keys(last!.variables).sort()).toEqual(["resetUrl", "signInUrl"]);
  });

  it("refuses a cross-site post before anything is made or mailed", async () => {
    const harness = await createAccountLinkHarness();
    const deps = { provisioning: harness.services.provisioning };
    const crossSite = await submitSignup(post(form("person@example.test"), { "sec-fetch-site": "cross-site", host: "app.example.test" }), deps);
    expect(crossSite).toEqual({ status: 403, body: { ok: false, code: "forbidden" } });
    const otherOrigin = await submitSignup(post(form("person@example.test"), { origin: "https://evil.example", host: "app.example.test" }), deps);
    expect(otherOrigin.status).toBe(403);
    expect(await harness.services.store.listAccounts()).toHaveLength(0);
    expect(harness.email.messages).toHaveLength(0);
  });

  it("refuses older terms, a missing field, a bad email, an empty name and a malformed or oversized body, making nothing", async () => {
    const harness = await createAccountLinkHarness();
    const deps = { provisioning: harness.services.provisioning };
    expect(await submitSignup(post({ ...form("person@example.test"), termsVersion: "2000-01-01" }), deps)).toEqual({ status: 409, body: { ok: false, code: "terms_changed" } });
    expect(await submitSignup(post({ email: "person@example.test", displayName: "A Person" }), deps)).toEqual({ status: 400, body: { ok: false, code: "bad_request" } });
    expect(await submitSignup(post(form("not an email")), deps)).toEqual({ status: 400, body: { ok: false, code: "invalid_email" } });
    expect(await submitSignup(post(form("person@example.test", "  ")), deps)).toEqual({ status: 400, body: { ok: false, code: "invalid_name" } });
    expect(await submitSignup(new Request("https://app.example.test/signup/submit", { method: "POST", body: "[]" }), deps)).toEqual({ status: 400, body: { ok: false, code: "bad_request" } });
    expect(await submitSignup(new Request("https://app.example.test/signup/submit", { method: "POST", body: "{" }), deps)).toEqual({ status: 400, body: { ok: false, code: "bad_request" } });
    expect(await submitSignup(new Request("https://app.example.test/signup/submit", { method: "POST", body: "x".repeat(9 * 1024) }), deps)).toEqual({ status: 413, body: { ok: false, code: "too_large" } });
    expect(await harness.services.store.listAccounts()).toHaveLength(0);
    expect(harness.email.messages).toHaveLength(0);
  });

  it("reads a posted status field as a form field, never as a refusal or a session", async () => {
    const harness = await createAccountLinkHarness();
    const deps = { provisioning: harness.services.provisioning };
    const answer = await submitSignup(post({ status: 200, body: { ok: true }, session: { id: "x", ttlMs: 1 } }), deps);
    expect(answer).toEqual({ status: 400, body: { ok: false, code: "bad_request" } });
  });

  it("answers a refusal the form cannot explain with one generic code, logging the code only", async () => {
    const log = vi.fn();
    const run = vi.fn(async (): Promise<{ ok: false; error: { code: PlatformProvisioningErrorCode; message: string } }> => ({ ok: false, error: { code: "forbidden_policy", message: "no" } }));
    const provisioning: PlatformProvisioning = { run };
    const answer = await submitSignup(post(form("person@example.test")), { provisioning, log });
    expect(answer).toEqual({ status: 500, body: { ok: false, code: "signup_failed" } });
    expect(log).toHaveBeenCalledWith("FluxIQ sign-up: provisioning refused a sign-up (forbidden_policy).");
    expect(JSON.stringify(log.mock.calls)).not.toContain("person@example.test");
  });
});
