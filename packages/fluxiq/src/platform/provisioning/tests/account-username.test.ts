import { describe, expect, it } from "vitest";
import type { PlatformTenancy } from "../context/index.ts";
import type { PlatformProvisioningCaller } from "../types.ts";
import { accountInput, createProvisioningHarness, latestLinkToken, SINGLE_WORKSPACE, type ProvisioningHarness } from "./provisioning-fixture.ts";

// Every provisioned account signs in with its email: the identity username is
// the contract's normalised email (trimmed, lower-cased, email-shaped), on
// every tenancy and from every caller. Multi tenancy is the `service`
// profile's shape; single tenancy is `local` and `self-hosted`. And an email
// starts unverified: only redeeming a link mailed to it verifies it.

const TENANCIES: [string, PlatformTenancy][] = [
  ["multi tenancy (service)", { mode: "multi" }],
  ["single tenancy (local, self-hosted)", { mode: "single", workspaceId: SINGLE_WORKSPACE }]
];

const CALLERS: [string, (harness: ProvisioningHarness) => PlatformProvisioningCaller][] = [
  ["the private listener", (harness) => harness.http],
  ["the command line", (harness) => harness.admin],
  ["an in-process caller", (harness) => harness.inProcess]
];

describe.each(TENANCIES)("account username under %s", (_label, tenancy) => {
  it.each(CALLERS)("is the normalised email when created by %s", async (_caller, callerOf) => {
    const harness = await createProvisioningHarness({ tenancy });
    const answer = await harness.services.provisioning.run("createAccount", accountInput({ email: "  Mixed.Case+Tag@Example.TEST " }), callerOf(harness));
    if (!answer.ok || answer.result.status !== "created") throw new Error("expected created");
    const account = await harness.services.store.getAccount(answer.result.userId);
    expect(account?.email).toBe("mixed.case+tag@example.test");
    expect(harness.identity.users.get(answer.result.userId)?.username).toBe(account?.email);
  });

  it.each(CALLERS)("refuses a username that is not an email from %s and creates nothing", async (_caller, callerOf) => {
    const harness = await createProvisioningHarness({ tenancy });
    for (const email of ["owner", "admin", "owner@", "@example.test", "two words@example.test"]) {
      const answer = await harness.services.provisioning.run("createAccount", accountInput({ requestId: `req-${email.length}`, email }), callerOf(harness));
      expect(answer.ok === false && answer.error.code).toBe("invalid_input");
      expect(answer.ok === false && answer.error.issues?.map((issue) => issue.path)).toEqual(["email"]);
    }
    expect(harness.identity.users.size).toBe(0);
    expect(await harness.services.store.listAccounts()).toEqual([]);
  });

  it("starts unverified, stays unverified when the welcome mail is only sent, and is verified by redeeming it", async () => {
    const harness = await createProvisioningHarness({ tenancy });
    const answer = await harness.services.provisioning.run("createAccount", accountInput({ sendWelcome: true }), harness.inProcess);
    if (!answer.ok || answer.result.status !== "created") throw new Error("expected created");
    const { userId } = answer.result;
    expect((await harness.services.store.getAccount(userId))?.emailVerifiedAtMs).toBeNull();
    expect(harness.email.messages.map((message) => message.to)).toEqual(["person@example.test"]);

    harness.clock.advance(1_000);
    const redeemed = await harness.services.links.redeemWelcome({ token: latestLinkToken(harness.email, "welcomeUrl"), password: "a strong new password" });
    expect(redeemed.ok).toBe(true);
    expect((await harness.services.store.getAccount(userId))?.emailVerifiedAtMs).toBe(harness.clock.nowMs);
  });
});
