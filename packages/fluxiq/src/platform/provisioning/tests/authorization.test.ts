import { describe, expect, it } from "vitest";
import { IamAuthorizer, IamStore, iamPrincipalFrn, iamWorkspaceFrn, MemoryIamAuditSink, resolveIamPredefinedPolicy } from "../../iam/index.ts";
import { provisioningAccountFrn } from "../authorization/index.ts";
import { ensureProvisionerIdentity } from "../service/index.ts";
import { MemoryRecordRepository } from "./memory-record-repository.ts";
import { accountInput, createProvisioningHarness } from "./provisioning-fixture.ts";

describe("provisioning authorisation", () => {
  it("records one allow decision per call for the provisioner, on the account it names", async () => {
    const harness = await createProvisioningHarness();
    const answer = await harness.services.provisioning.run("createAccount", accountInput(), harness.http);
    if (!answer.ok || answer.result.status !== "created") throw new Error("expected created");
    const decisions = harness.audit.records.filter((record) => record.category !== "iam-change");
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      category: "allow",
      principal: iamPrincipalFrn("service-identity", null, "website-backend"),
      action: "platform:CreateAccount",
      resources: [provisioningAccountFrn(answer.result.userId)],
      matched: { policy: "FluxIQProvisioner", sid: "ProvisionAccounts" },
      origin: "provisioning",
      requestId: "req-create-1",
      ipPrefix: "10.1.2.0/24"
    });

    await harness.services.provisioning.run("getAccount", { userId: answer.result.userId }, harness.http);
    const reads = harness.audit.records.filter((record) => record.action === "platform:GetAccount");
    expect(reads).toHaveLength(1);
    expect(reads[0]?.resources).toEqual([provisioningAccountFrn(answer.result.userId)]);
  });

  it("answers forbidden, records the deny, and changes nothing for a service identity without the provisioner policy", async () => {
    const harness = await createProvisioningHarness();
    const stranger = { kind: "service-identity", name: "stranger", transport: "http" } as const;
    const answer = await harness.services.provisioning.run("createAccount", accountInput(), stranger);
    expect(answer.ok === false && answer.error.code).toBe("forbidden");
    expect(await harness.services.store.listAccounts()).toEqual([]);
    expect(harness.identity.users.size).toBe(0);
    const deny = harness.audit.records.find((record) => record.category === "deny");
    expect(deny).toMatchObject({ principal: iamPrincipalFrn("service-identity", null, "stranger"), action: "platform:CreateAccount", matched: "implicit" });
  });

  it("lets FluxIQProvisioner reach account FRNs and explicitly denies it every workspace FRN", async () => {
    const repository = new MemoryRecordRepository();
    const sink = new MemoryIamAuditSink();
    const iam = new IamStore({ workspaceId: null, repository, resolveManagedPolicy: resolveIamPredefinedPolicy, auditSink: sink });
    await ensureProvisionerIdentity(iam, "website-backend");
    await ensureProvisionerIdentity(iam, "website-backend");
    expect(await iam.listAttachedPolicies(iam.principalFrn("service-identity", "website-backend"))).toEqual(["FluxIQProvisioner"]);
    const authorizer = new IamAuthorizer(iam, sink);
    const principal = { type: "service-identity", id: "website-backend", workspaceId: null, frn: iamPrincipalFrn("service-identity", null, "website-backend") } as const;
    const context = { workspaceId: null, origin: "provisioning", currentTimeMs: 1 } as const;

    const account = await authorizer.authorize(principal, "platform:CreateAccount", [{ frn: provisioningAccountFrn("someone") }], context);
    expect(account.decision).toBe("allow");
    const workspace = await authorizer.authorize(principal, "platform:CreateAccount", [{ frn: iamWorkspaceFrn("ws-1") }], context);
    expect(workspace).toMatchObject({ decision: "deny", matched: { policy: "FluxIQProvisioner", sid: "DenyWorkspaceContent" } });
    const content = await authorizer.authorize(principal, "studio:ListProjects", [{ frn: "frn:fluxiq:studio:ws-1:project/p1" }], context);
    expect(content).toMatchObject({ decision: "deny", matched: { policy: "FluxIQProvisioner", sid: "DenyWorkspaceContent" } });
    const pattern = await authorizer.authorize(principal, "platform:CreateAccount", [{ frn: "frn:fluxiq:platform::account/*" }], context);
    expect(pattern.decision).toBe("deny");
  });

  it("records platform-admin and in-process calls as allows citing their caller kind", async () => {
    const harness = await createProvisioningHarness();
    await harness.services.provisioning.run("createAccount", accountInput(), harness.admin);
    const created = (await harness.services.store.listAccounts())[0];
    expect(created?.createdVia).toBe("command-line");
    const admin = harness.audit.records.find((record) => record.action === "platform:CreateAccount");
    expect(admin).toMatchObject({ category: "allow", principal: "platform-admin", matched: { policy: "platform-admin", sid: null }, origin: "cli" });
  });

  it("makes setPassword unavailable over HTTP, and an unknown operation unavailable everywhere", async () => {
    const harness = await createProvisioningHarness();
    const answer = await harness.services.provisioning.run("setPassword", { requestId: "r", userId: "u1", password: "a long enough password" }, harness.http);
    expect(answer.ok === false && answer.error.code).toBe("operation_unavailable");
    expect(JSON.stringify(answer)).not.toContain("long enough");
    const unknown = await harness.services.provisioning.run("dropTables" as "getAccount", {}, harness.admin);
    expect(unknown.ok === false && unknown.error.code).toBe("operation_unavailable");
    expect(harness.audit.records.filter((record) => record.category !== "iam-change")).toEqual([]);
  });

  it("refuses an invalid input by path without echoing the values sent", async () => {
    const harness = await createProvisioningHarness();
    const answer = await harness.services.provisioning.run("rotateCredentials", { requestId: "r", userId: "u1", scope: "secret-scope-value" }, harness.http);
    expect(answer.ok === false && answer.error.code).toBe("invalid_input");
    expect(answer.ok === false && answer.error.issues).toEqual([{ path: "scope", message: "Not one of the allowed values." }]);
    expect(JSON.stringify(answer)).not.toContain("secret-scope-value");
  });
});
