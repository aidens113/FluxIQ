// @fluxiq-test-group real-sql
import { describe, expect, it, vi } from "vitest";
import { appManifestFixture } from "../../tests/fixtures/index.ts";
import { deferred, serviceFixture } from "./fixture.ts";

describe("app resolution awaited-boundary authority", () => {
  it("refuses authority that expires during the final installation read", async () => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    const read = fixture.store.getInstallation.bind(fixture.store);
    let reads = 0;
    vi.spyOn(fixture.store, "getInstallation").mockImplementation(async id => {
      const record = await read(id);
      reads += 1;
      if (reads === 2) fixture.state.now = fixture.state.operation!.expiresAtMs;
      return record;
    });
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
  });

  it.each(["revoked", "replaced", "expired"])("refuses authority %s while target lookup is pending", async change => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    const entered = deferred();
    const release = deferred();
    fixture.state.target = async () => {
      entered.resolve();
      await release.promise;
      return true;
    };
    const refusal = expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
    await entered.promise;
    if (change === "revoked") fixture.state.operation = null;
    if (change === "replaced") fixture.state.operation!.userId = "user.other";
    if (change === "expired") fixture.state.now = fixture.state.operation!.expiresAtMs;
    release.resolve();
    await refusal;
  });

  it("refuses switching to another registered origin during the awaited target check", async () => {
    const manifest = await appManifestFixture({ frontend: { mode: "production", entryUrl: "https://apps.example.test/orders", allowedOrigins: ["https://apps.example.test", "https://second.example.test"], redirectUris: ["https://apps.example.test/callback"] } });
    const fixture = await serviceFixture(manifest);
    await fixture.service.install(fixture.context, fixture.proposal);
    fixture.state.target = async () => {
      fixture.state.operation!.delegation.origin = "https://second.example.test";
      return true;
    };
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "forbidden" });
  });

  it.each(["update", "revoke"])("refuses installation %s during awaited target lookup", async change => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    const entered = deferred();
    const release = deferred();
    fixture.state.target = async () => {
      entered.resolve();
      await release.promise;
      return true;
    };
    const refusal = expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "stale_resolution" });
    await entered.promise;
    try {
      fixture.state.now = 2_000;
      if (change === "update") await fixture.service.update(fixture.context, { installationId: "installation.one", expectedRevision: 1, proposal: fixture.proposal });
      else await fixture.service.revoke(fixture.context, "installation.one");
    } finally {
      release.resolve();
    }
    await refusal;
  });

  it.each(["update", "revoke"])("refuses installation %s during the final awaited authority refresh", async change => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    const entered = deferred();
    const release = deferred();
    fixture.authority.operation.mockImplementationOnce(async () => structuredClone(fixture.state.operation));
    fixture.authority.operation.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return structuredClone(fixture.state.operation);
    });
    const refusal = expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "stale_resolution" });
    await entered.promise;
    try {
      fixture.state.now = 2_000;
      if (change === "update") await fixture.service.update(fixture.context, { installationId: "installation.one", expectedRevision: 1, proposal: fixture.proposal });
      else await fixture.service.revoke(fixture.context, "installation.one");
    } finally {
      release.resolve();
    }
    await refusal;
    expect(fixture.authority.operation).toHaveBeenCalledTimes(2);
  });

  it("passes isolated clones to target and authority ports", async () => {
    const fixture = await serviceFixture();
    const installed = await fixture.service.install(fixture.context, fixture.proposal);
    fixture.state.target = async request => {
      request.installation.approvedGrants.length = 0;
      request.manifest.operations[0]!.id = "forged-operation";
      request.actor.delegation.origin = "https://forged.example.test";
      return true;
    };
    const resolution = await fixture.service.resolveOperation(fixture.context, fixture.invocation);
    expect(resolution.operationId).toBe("read-orders");
    expect(resolution.requiredGrants).toEqual(fixture.manifest.requestedGrants);
    expect(await fixture.store.getInstallation(installed.installationId)).toEqual(installed);
    expect(await fixture.store.getManifest(fixture.manifest)).toEqual(fixture.manifest);
  });
});
