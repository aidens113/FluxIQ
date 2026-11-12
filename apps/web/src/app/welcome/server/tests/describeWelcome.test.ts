import { describe, expect, it } from "vitest";
import { describeWelcome } from "../describeWelcome";
import { createAccountLinkHarness, type AccountLinkHarness } from "./accountLinkHarness";

const URL_ = "https://app.example.test/welcome/describe";
const DAY_MS = 24 * 60 * 60 * 1000;

function post(body: unknown, headers: Record<string, string> = {}): Request {
  // A browser always sends the Host it addressed; the cross-site guard compares Origin with it.
  return new Request(URL_, { method: "POST", headers: { "content-type": "application/json", host: new URL(URL_).host, ...headers }, body: JSON.stringify(body) });
}

function deps(harness: AccountLinkHarness, now = Date.now) {
  return { store: harness.services.store, now };
}

describe("describeWelcome", () => {
  it("says the email, role and workspace a link is for, without spending it or answering the token", async () => {
    const harness = await createAccountLinkHarness();
    await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");
    const answer = await describeWelcome(post({ token }), deps(harness));
    expect(answer).toEqual({ status: 200, body: { ok: true, invitation: { email: "person@example.test", role: "member", workspaceKind: "personal" } } });
    expect(JSON.stringify(answer)).not.toContain(token);
    // Still usable: describing it twice gives the same answer, and redeeming it then works.
    expect((await describeWelcome(post({ token }), deps(harness))).status).toBe(200);
    const redeemed = await harness.services.links.redeemWelcome({ token, password: "a strong new password" });
    expect(redeemed.ok).toBe(true);
  });

  it("refuses a used link with the one invalid-link code", async () => {
    const harness = await createAccountLinkHarness();
    await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");
    await harness.services.links.redeemWelcome({ token, password: "a strong new password" });
    expect(await describeWelcome(post({ token }), deps(harness))).toEqual({ status: 400, body: { ok: false, code: "invalid_link" } });
  });

  it("refuses an expired link, an unknown one, a malformed one and a reset link alike", async () => {
    const harness = await createAccountLinkHarness();
    await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");
    const later = () => Date.now() + DAY_MS + 60_000;
    const invalid = { status: 400, body: { ok: false, code: "invalid_link" } };
    expect(await describeWelcome(post({ token }), deps(harness, later))).toEqual(invalid);
    expect(await describeWelcome(post({ token: "A".repeat(43) }), deps(harness))).toEqual(invalid);
    expect(await describeWelcome(post({ token: "short" }), deps(harness))).toEqual(invalid);
    expect(await describeWelcome(post({}), deps(harness))).toEqual(invalid);
    await harness.services.links.requestReset({ email: "person@example.test" });
    expect(await describeWelcome(post({ token: harness.latestToken("resetUrl") }), deps(harness))).toEqual(invalid);
  });

  it("says a disabled account is disabled, and refuses a cross-site request before reading the link", async () => {
    const harness = await createAccountLinkHarness();
    const userId = await harness.provision("person@example.test");
    const token = harness.latestToken("welcomeUrl");
    expect((await describeWelcome(post({ token }, { "sec-fetch-site": "cross-site" }), deps(harness))).body).toEqual({ ok: false, code: "forbidden" });
    await harness.services.provisioning.run("disableAccount", { requestId: "req-disable-1", userId, reason: "test" }, { kind: "platform-admin", transport: "in-process" });
    expect(await describeWelcome(post({ token }), deps(harness))).toEqual({ status: 403, body: { ok: false, code: "disabled" } });
  });
});
