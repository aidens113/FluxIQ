import { describe, expect, it } from "vitest";
import { accountInput, createProvisioningHarness, SINGLE_WORKSPACE } from "./provisioning-fixture.ts";

describe("provisioning idempotency", () => {
  it("replays the first answer for the same requestId and input, and creates once", async () => {
    const harness = await createProvisioningHarness();
    const first = await harness.services.provisioning.run("createAccount", accountInput({ sendWelcome: true }), harness.http);
    const second = await harness.services.provisioning.run("createAccount", accountInput({ sendWelcome: true }), harness.http);
    expect(second).toEqual(first);
    expect(await harness.services.store.listAccounts()).toHaveLength(1);
    expect(harness.email.messages).toHaveLength(1);
  });

  it("answers request_conflict for the same requestId with a different input", async () => {
    const harness = await createProvisioningHarness();
    await harness.services.provisioning.run("createAccount", accountInput(), harness.http);
    const conflict = await harness.services.provisioning.run("createAccount", accountInput({ displayName: "Changed" }), harness.http);
    expect(conflict.ok === false && conflict.error.code).toBe("request_conflict");
  });

  it("stores no password-derived digest and runs again after a refusal, since a refusal changed nothing", async () => {
    const harness = await createProvisioningHarness({ tenancy: { mode: "single", workspaceId: SINGLE_WORKSPACE } });
    const weak = await harness.services.provisioning.run("createAccount", accountInput({ password: "too-short" }), harness.inProcess);
    expect(weak.ok === false && weak.error.code).toBe("weak_password");
    const strong = await harness.services.provisioning.run("createAccount", accountInput({ password: "now long enough to pass" }), harness.inProcess);
    expect(strong.ok && strong.result.status).toBe("created");
    const replay = await harness.services.provisioning.run("createAccount", accountInput({ password: "a different long password" }), harness.inProcess);
    expect(replay).toEqual(strong);
    const rows = JSON.stringify(await harness.repository.list({ domainId: null }));
    expect(rows).not.toContain("now long enough to pass");
    expect(rows).not.toContain("a different long password");
  });

  it("serialises concurrent mutations, so two creates of one email make one account", async () => {
    const harness = await createProvisioningHarness();
    const [a, b] = await Promise.all([
      harness.services.provisioning.run("createAccount", accountInput({ requestId: "concurrent-a" }), harness.http),
      harness.services.provisioning.run("createAccount", accountInput({ requestId: "concurrent-b" }), harness.http)
    ]);
    const statuses = [a, b].map((answer) => (answer.ok ? answer.result.status : answer.error.code)).sort();
    expect(statuses).toEqual(["created", "exists"]);
    expect(await harness.services.store.listAccounts()).toHaveLength(1);
  });
});
