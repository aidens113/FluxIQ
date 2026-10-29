import { describe, expect, it } from "vitest";
import { MemoryIamAuditSink } from "../../iam/index.ts";
import { IdentityAccessService } from "../../../programs/identity-access/index.ts";
import { MemoryEmailSender } from "../email/index.ts";
import { createPlatformServices } from "../service/index.ts";
import { accountInput } from "./provisioning-fixture.ts";
import { MemoryRecordRepository } from "./memory-record-repository.ts";

// With the real identity-access service: an operation that would disable,
// delete or demote the last enabled administrator is answered
// `last_administrator`, and the account, its membership and its role are as
// they were. Dummy values only; scrypt at N=2^10.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const REFUSED = { ok: false, error: { code: "last_administrator", message: "The last enabled administrator cannot be disabled, deleted or demoted." } };

async function lastAdministrator() {
  const repository = new MemoryRecordRepository();
  const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
  const services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity,
    email: new MemoryEmailSender(),
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "single", workspaceId: "workspace-main" }
  });
  const http = services.provisionerCaller("10.1.2.3");
  const created = await services.provisioning.run("createAccount", accountInput({ policies: ["FluxIQAdministratorAccess"] }), http);
  if (!created.ok || created.result.status !== "created") throw new Error("expected created");
  const { userId, workspaceId } = created.result;
  // The bootstrap administrator steps down, so the new account is the last enabled administrator.
  await identity.updateUser({ id: "admin", enabled: false });
  return { services, identity, http, userId, workspaceId };
}

describe("the last enabled administrator", () => {
  it("is not disabled, demoted or deleted, and nothing about it changes", async () => {
    const { services, identity, http, userId, workspaceId } = await lastAdministrator();

    expect(await services.provisioning.run("disableAccount", { requestId: "d1", userId, reason: "Review" }, http)).toEqual(REFUSED);
    expect(await services.provisioning.run("setPolicies", { requestId: "sp1", userId, workspaceId, policies: ["FluxIQUserAccess"] }, http)).toEqual(REFUSED);
    expect(await services.provisioning.run("deleteAccount", { requestId: "del-s", userId, mode: "scheduled" }, http)).toEqual(REFUSED);
    expect(await services.provisioning.run("deleteAccount", { requestId: "del-i", userId, mode: "immediate" }, http)).toEqual(REFUSED);

    expect((await services.store.getAccount(userId))?.status).toBe("active");
    expect((await services.store.getMembership(workspaceId, userId))?.policies).toEqual(["FluxIQAdministratorAccess"]);
    const user = (await identity.snapshot()).users.find((candidate) => candidate.id === userId);
    expect(user).toMatchObject({ enabled: true, roleId: "admin" });
  });
});
