import { describe, expect, it } from "vitest";
import { iamPrincipalFrn } from "../../iam/index.ts";
import { accountInput, createProvisioningHarness, SINGLE_WORKSPACE } from "./provisioning-fixture.ts";

describe("createAccount", () => {
  it("creates the identity user, account, personal workspace, membership and attachments", async () => {
    const harness = await createProvisioningHarness();
    const answer = await harness.services.provisioning.run("createAccount", accountInput({ sendWelcome: true }), harness.http);
    expect(answer.ok).toBe(true);
    if (!answer.ok || answer.result.status !== "created") throw new Error("expected created");
    const { userId, workspaceId } = answer.result;

    const user = harness.identity.users.get(userId);
    expect(user).toMatchObject({ username: "person@example.test", displayName: "A Person", roleId: "viewer", enabled: true, password: null });
    const account = await harness.services.store.getAccount(userId);
    expect(account).toMatchObject({ email: "person@example.test", status: "active", createdVia: "provisioning-listener", emailVerifiedAtMs: null, externalId: null });
    expect(await harness.services.store.getWorkspace(workspaceId)).toMatchObject({ kind: "personal", ownerUserId: userId });
    expect(harness.createdWorkspaces).toEqual([workspaceId]);
    expect(await harness.services.store.getMembership(workspaceId, userId)).toMatchObject({ policies: ["FluxIQUserAccess"], status: "active" });

    const changes = harness.audit.records.filter((record) => record.category === "iam-change" && record.action === "iam:AttachUserPolicy");
    expect(changes).toHaveLength(1);
    expect(changes[0]?.resources[0]).toBe(iamPrincipalFrn("user", workspaceId, userId));
    expect(changes[0]?.matched).toEqual({ policy: "FluxIQProvisioner", sid: "ProvisionAccounts" });

    expect(harness.email.messages.map((message) => message.template)).toEqual(["welcome"]);
    expect(harness.email.messages[0]?.to).toBe("person@example.test");
  });

  it("refuses a password over HTTP as invalid_input without echoing it", async () => {
    const harness = await createProvisioningHarness();
    const answer = await harness.services.provisioning.run("createAccount", accountInput({ password: "correct horse battery staple" }), harness.http);
    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.error.code).toBe("invalid_input");
    expect(answer.error.issues).toEqual([{ path: "password", message: "Unknown field." }]);
    expect(JSON.stringify(answer)).not.toContain("correct horse");
    expect(await harness.services.store.listAccounts()).toEqual([]);
  });

  it("answers an existing email with exists over HTTP and email_taken in-process, mailing the address", async () => {
    const harness = await createProvisioningHarness();
    await harness.services.provisioning.run("createAccount", accountInput(), harness.http);
    harness.email.clear();

    const again = await harness.services.provisioning.run("createAccount", accountInput({ requestId: "req-create-2", displayName: "Someone Else" }), harness.http);
    expect(again).toEqual({ ok: true, result: { status: "exists" } });
    expect(harness.email.messages.map((message) => message.template)).toEqual(["account-exists"]);
    expect(harness.email.messages[0]?.variables).toEqual({ signInUrl: "https://app.example.test/", resetUrl: "https://app.example.test/reset" });

    const inProcess = await harness.services.provisioning.run("createAccount", accountInput({ requestId: "req-create-3" }), harness.inProcess);
    expect(inProcess.ok === false && inProcess.error.code).toBe("email_taken");
    expect(await harness.services.store.listAccounts()).toHaveLength(1);
  });

  it("refuses policies outside the provisionable set, and the owner policy in multi tenancy, as forbidden_policy", async () => {
    const harness = await createProvisioningHarness();
    for (const policies of [["FluxIQProvisioner"], ["FluxIQBrowserSession"], ["FluxIQServiceGuardrail"], ["MyCustomPolicy"], ["FluxIQOwnerFullAccess"]]) {
      const answer = await harness.services.provisioning.run("createAccount", accountInput({ requestId: `req-${policies[0]}`, policies }), harness.inProcess);
      expect(answer.ok === false && answer.error.code).toBe("forbidden_policy");
    }
    expect(await harness.services.store.listAccounts()).toEqual([]);
    expect(harness.identity.users.size).toBe(0);
  });

  it("refuses the owner policy over HTTP even in single tenancy", async () => {
    const harness = await createProvisioningHarness({ tenancy: { mode: "single", workspaceId: SINGLE_WORKSPACE } });
    const answer = await harness.services.provisioning.run("createAccount", accountInput({ policies: ["FluxIQOwnerFullAccess"] }), harness.http);
    expect(answer.ok === false && answer.error.code).toBe("forbidden_policy");
  });

  it("claims the single-tenancy owner in-process with the owner policy and a password", async () => {
    const harness = await createProvisioningHarness({ tenancy: { mode: "single", workspaceId: SINGLE_WORKSPACE } });
    const answer = await harness.services.provisioning.run(
      "createAccount",
      { requestId: "owner-claim", email: "owner@example.test", displayName: "Owner", policies: ["FluxIQOwnerFullAccess"], workspace: SINGLE_WORKSPACE, password: "a long enough password" },
      { kind: "in-process", actorUserId: null, transport: "in-process" }
    );
    expect(answer).toEqual({ ok: true, result: { status: "created", userId: expect.any(String), workspaceId: SINGLE_WORKSPACE } });
    if (!answer.ok || answer.result.status !== "created") return;
    expect(harness.identity.users.get(answer.result.userId)).toMatchObject({ roleId: "admin", password: "a long enough password", username: "owner@example.test" });
    expect(await harness.services.store.getWorkspace(SINGLE_WORKSPACE)).toMatchObject({ kind: "single", ownerUserId: null });
    expect(harness.createdWorkspaces).toEqual([]);
    const attached = await harness.services.store.getMembership(SINGLE_WORKSPACE, answer.result.userId);
    expect(attached?.policies).toEqual(["FluxIQOwnerFullAccess"]);
    const allow = harness.audit.records.find((record) => record.action === "platform:CreateAccount");
    expect(allow).toMatchObject({ category: "allow", principal: "in-process", matched: { policy: "in-process", sid: null }, origin: "provisioning" });
    expect(JSON.stringify(harness.audit.records)).not.toContain("a long enough password");
    expect(JSON.stringify(await harness.repository.list({ domainId: null }))).not.toContain("a long enough password");

    const viaNew = await harness.services.provisioning.run("createAccount", accountInput({ requestId: "add-user", workspace: "new", policies: ["FluxIQReadOnlyAccess"] }), harness.inProcess);
    expect(viaNew.ok && viaNew.result.status === "created" && viaNew.result.workspaceId).toBe(SINGLE_WORKSPACE);
    const elsewhere = await harness.services.provisioning.run("createAccount", accountInput({ requestId: "add-elsewhere", email: "x@example.test", workspace: "other" }), harness.inProcess);
    expect(elsewhere.ok === false && elsewhere.error.code).toBe("not_found");
  });

  it("refuses a short password with weak_password and creates nothing", async () => {
    const harness = await createProvisioningHarness({ tenancy: { mode: "single", workspaceId: SINGLE_WORKSPACE } });
    const answer = await harness.services.provisioning.run("createAccount", accountInput({ password: "short" }), harness.inProcess);
    expect(answer.ok === false && answer.error.code).toBe("weak_password");
    expect(JSON.stringify(answer)).not.toContain("short\"");
    expect(harness.identity.users.size).toBe(0);
  });

  it("joins an organisation workspace only with the entitlement, and refuses unknown or personal workspaces", async () => {
    const harness = await createProvisioningHarness();
    await harness.services.store.putWorkspace({ workspaceId: "org-1", kind: "organisation", ownerUserId: null, createdAtMs: 1 });
    const refused = await harness.services.provisioning.run("createAccount", accountInput({ workspace: "org-1" }), harness.http);
    expect(refused.ok === false && refused.error.code).toBe("entitlement_required");
    const unknown = await harness.services.provisioning.run("createAccount", accountInput({ requestId: "r2", workspace: "nope" }), harness.http);
    expect(unknown.ok === false && unknown.error.code).toBe("not_found");

    const entitled = await createProvisioningHarness({ organisation: true });
    await entitled.services.store.putWorkspace({ workspaceId: "org-1", kind: "organisation", ownerUserId: null, createdAtMs: 1 });
    const joined = await entitled.services.provisioning.run("createAccount", accountInput({ workspace: "org-1", policies: ["FluxIQAdministratorAccess"] }), entitled.http);
    expect(joined.ok && joined.result.status === "created" && joined.result.workspaceId).toBe("org-1");
    const personal = (await entitled.services.store.listWorkspaces()).find((workspace) => workspace.kind === "personal");
    expect(personal).toBeUndefined();
  });

  it("refuses an externalId that already names another account", async () => {
    const harness = await createProvisioningHarness();
    await harness.services.provisioning.run("createAccount", accountInput({ externalId: "site-1" }), harness.http);
    const answer = await harness.services.provisioning.run("createAccount", accountInput({ requestId: "r2", email: "other@example.test", externalId: "site-1" }), harness.http);
    expect(answer.ok === false && answer.error).toMatchObject({ code: "invalid_input", issues: [{ path: "externalId" }] });
  });
});
