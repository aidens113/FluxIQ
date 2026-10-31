import { describe, expect, it } from "vitest";
import { iamPrincipalFrn } from "../../iam/index.ts";
import { accountInput, createProvisioningHarness } from "./provisioning-fixture.ts";

// `workspaceIam(id)` is the store provisioning attaches member policies to,
// so a registry reading it as its policy source sees what provisioning wrote.
describe("PlatformServices.workspaceIam", () => {
  it("returns the store provisioning attached the member's policies to, cached per workspace", async () => {
    const harness = await createProvisioningHarness();
    const created = await harness.services.provisioning.run("createAccount", accountInput({ policies: ["FluxIQUserAccess"] }), harness.http);
    if (!created.ok || created.result.status !== "created") throw new Error("expected created");
    const { userId, workspaceId } = created.result;
    const store = harness.services.workspaceIam(workspaceId);
    expect(await store.listAttachedPolicies(iamPrincipalFrn("user", workspaceId, userId))).toEqual(["FluxIQUserAccess"]);
    expect(harness.services.workspaceIam(workspaceId)).toBe(store);
    expect(harness.services.workspaceIam("workspace-other")).not.toBe(store);
  });
});
