// @fluxiq-test-group real-sql
import { describe, expect, it } from "vitest";
import type { AppOperationActor } from "../../model/index.ts";
import { appManifestFixture } from "../../tests/fixtures/index.ts";
import { executionManifest, serviceFixture } from "./fixture.ts";

describe("current app operation resolution", () => {
  it("resolves only checked metadata with fresh authority and no execution receipt", async () => {
    const fixture = await serviceFixture();
    const installed = await fixture.service.install(fixture.context, fixture.proposal);
    const resolution = await fixture.service.resolveOperation(fixture.context, fixture.invocation);
    expect(resolution).toEqual({ schemaVersion: 1, kind: "operation-resolution", installationId: installed.installationId, operationId: "read-orders", operationKind: "query", manifestDigest: fixture.manifest.manifestDigest, generation: 1, revision: 1, binding: fixture.manifest.operations[0]!.binding, target: installed.target, payer: { kind: "no-managed-compute-charge" }, requiredGrants: fixture.manifest.operations[0]!.requestedGrants });
    expect(fixture.authority.operation).toHaveBeenCalledTimes(2);
    expect(fixture.checkTarget).toHaveBeenCalledTimes(1);
    expect(await fixture.store.history(installed.installationId)).toHaveLength(1);
    for (const field of ["runId", "accepted", "status", "receipt", "bearer", "inputs", "idempotencyKey"]) expect(resolution).not.toHaveProperty(field);
  });

  it("rejects outer authority injection while allowing ordinary business field names", async () => {
    const operation = (await appManifestFixture()).operations[0]!;
    const fixture = await serviceFixture(await appManifestFixture({ operations: [{ ...operation, inputs: {} }] }));
    await fixture.service.install(fixture.context, fixture.proposal);
    for (const field of ["workspaceId", "userId", "role", "payer", "target", "grants", "origin"]) {
      await expect(fixture.service.resolveOperation(fixture.context, { ...fixture.invocation, [field]: "forged" })).rejects.toMatchObject({ code: "invalid_request" });
    }
    const inputs = { role: "business-role", workspace: "business-workspace", payer: "invoice-owner" };
    await fixture.service.resolveOperation(fixture.context, { ...fixture.invocation, inputs });
    expect(fixture.checkTarget.mock.calls[0]![0].actor).toMatchObject({ userId: "user.one", workspaceId: "workspace.one" });
    expect(JSON.stringify(await fixture.store.history("installation.one"))).not.toContain("business-workspace");
  });

  it("requires current workspace membership and rejects expired or foreign callers before target lookup", async () => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    const baseline = structuredClone(fixture.state.operation!);
    for (const actor of [null, { ...baseline, workspaceId: "workspace.foreign" }, { ...baseline, expiresAtMs: fixture.state.now }]) {
      fixture.state.operation = actor;
      await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
    }
    fixture.state.operation = baseline;
    await expect(fixture.service.resolveOperation({ ...fixture.context, role: "owner" }, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
    expect(fixture.checkTarget).not.toHaveBeenCalled();
  });

  it("binds delegation to exact publisher, app, installation, generation and registered origin", async () => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    const baseline = structuredClone(fixture.state.operation!);
    const patches: Partial<AppOperationActor["delegation"]>[] = [
      { publisherId: "publisher.other" }, { appId: "other-app" }, { installationId: "installation.other" }, { generation: 0 }, { generation: 2 }, { origin: "https://apps.example.test.evil" }, { origin: "https://apps.example.test/" }
    ];
    for (const patch of patches) {
      fixture.state.operation = { ...baseline, delegation: { ...baseline.delegation, ...patch } };
      await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(fixture.checkTarget).not.toHaveBeenCalled();
  });

  it("requires both installed consent and current delegated grants without widening either", async () => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    fixture.state.operation!.delegation.grants = [];
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
    fixture.state.operation!.delegation.grants = [...fixture.manifest.requestedGrants, { capability: "dataset.write", bindingId: "dataset:orders" }];
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
    const installed = (await fixture.store.getInstallation("installation.one"))!;
    await fixture.store.replaceInstallation({ ...installed, revision: 2, generation: 2, approvedGrants: [] }, 1, "user.one", async () => true);
    fixture.state.operation!.delegation.generation = 2;
    fixture.state.operation!.delegation.grants = [];
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
    expect(fixture.checkTarget).not.toHaveBeenCalled();
  });

  it("validates typed inputs and named operation before asking the execution target", async () => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    await expect(fixture.service.resolveOperation(fixture.context, { ...fixture.invocation, inputs: { limit: 0 } })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(fixture.service.resolveOperation(fixture.context, { ...fixture.invocation, operationId: "not-registered" })).rejects.toMatchObject({ code: "unavailable" });
    expect(fixture.checkTarget).not.toHaveBeenCalled();
  });

  it("rejects an old or malformed expected resolution after fresh checks", async () => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    const expected = await fixture.service.resolveOperation(fixture.context, fixture.invocation);
    expect(await fixture.service.resolveOperation(fixture.context, fixture.invocation, expected)).toEqual(expected);
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation, { ...expected, revision: 2 })).rejects.toMatchObject({ code: "stale_resolution" });
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation, { ...expected, manifestDigest: "c".repeat(64) })).rejects.toMatchObject({ code: "stale_resolution" });
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation, { ...expected, generation: 0 })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fixture.checkTarget).toHaveBeenCalledTimes(4);
  });
});

describe("explicit environment and payer resolution", () => {
  it("returns no managed compute charge for a query even when the installation has an account payer", async () => {
    const fixture = await serviceFixture();
    const proposal = { ...fixture.proposal, target: { kind: "managed-cloud", environment: "cloud", targetId: "cloud.one" }, payer: { kind: "workspace", accountId: "account.one" } };
    await fixture.service.install(fixture.context, proposal);
    fixture.state.target = async request => request.installation.target.targetId === "cloud.one" && request.installation.payer.kind === "workspace" && request.installation.payer.accountId === "account.one";
    const resolution = await fixture.service.resolveOperation(fixture.context, fixture.invocation);
    expect(resolution).toMatchObject({ operationKind: "query", payer: { kind: "no-managed-compute-charge" } });
    expect(await fixture.store.history("installation.one")).toHaveLength(1);
  });

  it("requires explicit managed execution payer and a positive host target/account check", async () => {
    const fixture = await serviceFixture(await executionManifest());
    const target = { kind: "managed-cloud", environment: "cloud", targetId: "cloud.one" };
    await expect(fixture.service.install(fixture.context, { ...fixture.proposal, target })).rejects.toMatchObject({ code: "invalid_request" });
    expect(await fixture.store.getInstallation("installation.one")).toBeNull();
    const proposal = { ...fixture.proposal, target, payer: { kind: "workspace", accountId: "account.one" } };
    await fixture.service.install(fixture.context, proposal);
    const invocation = { ...fixture.invocation, operationId: "fulfill", inputs: "order-one" };
    fixture.state.target = async () => false;
    await expect(fixture.service.resolveOperation(fixture.context, invocation)).rejects.toMatchObject({ code: "target_unavailable" });
    fixture.state.target = async request => request.operation.kind === "execution" && request.installation.payer.kind === "workspace" && request.installation.payer.accountId === "account.one" && request.actor.userId === "user.one";
    expect(await fixture.service.resolveOperation(fixture.context, invocation)).toMatchObject({ operationKind: "execution", target, payer: { kind: "workspace", accountId: "account.one" } });
    expect(await fixture.store.history("installation.one")).toHaveLength(1);
  });

  it("keeps customer-owned execution on its selected target without managed compute charge", async () => {
    const fixture = await serviceFixture(await executionManifest());
    await fixture.service.install(fixture.context, fixture.proposal);
    expect(await fixture.service.resolveOperation(fixture.context, { ...fixture.invocation, operationId: "fulfill", inputs: "order-one" })).toMatchObject({ operationKind: "execution", target: fixture.proposal.target, payer: { kind: "no-managed-compute-charge" } });
    fixture.state.target = async () => false;
    await expect(fixture.service.resolveOperation(fixture.context, { ...fixture.invocation, operationId: "fulfill", inputs: "order-one" })).rejects.toMatchObject({ code: "target_unavailable" });
    expect((await fixture.store.getInstallation("installation.one"))?.target).toEqual(fixture.proposal.target);
  });
});
