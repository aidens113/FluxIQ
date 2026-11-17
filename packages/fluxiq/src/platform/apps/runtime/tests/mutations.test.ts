// @fluxiq-test-group real-sql
import { describe, expect, it } from "vitest";
import { appManifestFixture } from "../../tests/fixtures/index.ts";
import { appProposal, serviceFixture } from "./fixture.ts";

describe("app registry trusted configuration mutations", () => {
  it("derives installer, workspace, id, generation and times from trusted ports", async () => {
    const fixture = await serviceFixture();
    fixture.state.actor = { userId: "server.user", workspaceId: "server.workspace", expiresAtMs: 20_000 };
    fixture.state.now = 2_000;
    const installed = await fixture.service.install(fixture.context, fixture.proposal);
    expect(installed).toMatchObject({ installationId: "installation.one", workspaceId: "server.workspace", installedByUserId: "server.user", installedAtMs: 2_000, updatedAtMs: 2_000, generation: 1, revision: 1, status: "active" });
    expect((await fixture.store.history(installed.installationId)).map(entry => entry.actorUserId)).toEqual(["server.user"]);
    expect(fixture.authority.installation).toHaveBeenCalledTimes(2);
    expect(fixture.checkTarget).not.toHaveBeenCalled();
    expect(Object.keys(fixture.service).sort()).toEqual(["install", "registerManifest", "resolveOperation", "revoke", "update"]);
  });

  it("refuses request-field identity injection and ignores lookalike untrusted context", async () => {
    const fixture = await serviceFixture();
    for (const field of ["workspaceId", "installedByUserId", "installationId", "generation", "status", "role", "userId", "installedAtMs"]) {
      await expect(fixture.service.install(fixture.context, { ...fixture.proposal, [field]: "forged" })).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(fixture.authority.installation).not.toHaveBeenCalled();
    await expect(fixture.service.install({ ...fixture.context, userId: "owner", workspaceId: "workspace.one" }, fixture.proposal)).rejects.toMatchObject({ code: "forbidden" });
    expect(await fixture.store.listInstallations("workspace.one")).toEqual([]);
  });

  it("requires current publisher permission even for an already registered manifest", async () => {
    const fixture = await serviceFixture();
    const next = await appManifestFixture({ version: "1.1.0" });
    fixture.state.publication = { userId: "user.one", publisherId: "publisher.foreign", expiresAtMs: 10_000 };
    await expect(fixture.service.registerManifest(fixture.context, next)).rejects.toMatchObject({ code: "forbidden" });
    expect(await fixture.store.getManifest(next)).toBeNull();
    fixture.state.publication = null;
    await expect(fixture.service.registerManifest(fixture.context, fixture.manifest)).rejects.toMatchObject({ code: "forbidden" });
    expect(await fixture.store.getManifest(fixture.manifest)).toEqual(fixture.manifest);
  });

  it("rechecks publisher permission inside the actual SQLite mutation guard", async () => {
    const fixture = await serviceFixture();
    const next = await appManifestFixture({ version: "1.1.0" });
    const previous = structuredClone(fixture.state.publication);
    fixture.authority.publication.mockImplementationOnce(async () => {
      fixture.state.publication = null;
      return previous;
    });
    await expect(fixture.service.registerManifest(fixture.context, next)).rejects.toMatchObject({ code: "forbidden" });
    expect(await fixture.store.getManifest(next)).toBeNull();
  });

  it("rolls back install when fresh authority disappears before commit", async () => {
    const fixture = await serviceFixture();
    const previous = structuredClone(fixture.state.actor);
    fixture.authority.installation.mockImplementationOnce(async () => {
      fixture.state.actor = null;
      return previous;
    });
    await expect(fixture.service.install(fixture.context, fixture.proposal)).rejects.toMatchObject({ code: "forbidden" });
    expect(await fixture.store.getInstallation("installation.one")).toBeNull();
    expect(await fixture.store.history("installation.one")).toEqual([]);
  });

  it("updates exact consent, preserves original ownership and rejects stale revision", async () => {
    const fixture = await serviceFixture();
    const installed = await fixture.service.install(fixture.context, fixture.proposal);
    const nextManifest = await appManifestFixture({ version: "1.1.0" });
    await fixture.service.registerManifest(fixture.context, nextManifest);
    fixture.state.actor = { userId: "user.admin", workspaceId: installed.workspaceId, expiresAtMs: 10_000 };
    fixture.state.now = 2_000;
    const proposal = { ...appProposal(nextManifest), approvedGrants: [] };
    const updated = await fixture.service.update(fixture.context, { installationId: installed.installationId, expectedRevision: 1, proposal });
    expect(updated).toMatchObject({ app: { version: "1.1.0" }, installedByUserId: "user.one", installedAtMs: 1_000, updatedAtMs: 2_000, revision: 2, generation: 2, approvedGrants: [] });
    expect((await fixture.store.history(installed.installationId)).map(entry => entry.actorUserId)).toEqual(["user.one", "user.admin"]);
    await expect(fixture.service.update(fixture.context, { installationId: installed.installationId, expectedRevision: 1, proposal })).rejects.toMatchObject({ code: "conflict" });
    expect((await fixture.store.getInstallation(installed.installationId))?.approvedGrants).toEqual([]);
  });

  it("refuses foreign workspace update/revoke and permanently records authorized revocation", async () => {
    const fixture = await serviceFixture();
    const installed = await fixture.service.install(fixture.context, fixture.proposal);
    fixture.state.actor = { userId: "foreign.admin", workspaceId: "workspace.foreign", expiresAtMs: 10_000 };
    await expect(fixture.service.update(fixture.context, { installationId: installed.installationId, expectedRevision: 1, proposal: fixture.proposal })).rejects.toMatchObject({ code: "forbidden" });
    await expect(fixture.service.revoke(fixture.context, installed.installationId)).rejects.toMatchObject({ code: "forbidden" });
    fixture.state.actor = { userId: "user.one", workspaceId: installed.workspaceId, expiresAtMs: 10_000 };
    fixture.state.now = 2_000;
    const revoked = await fixture.service.revoke(fixture.context, installed.installationId);
    expect(revoked).toMatchObject({ status: "revoked", revision: 2, generation: 2, revokedAtMs: 2_000 });
    expect(await fixture.service.revoke(fixture.context, installed.installationId)).toEqual(revoked);
    await expect(fixture.service.update(fixture.context, { installationId: installed.installationId, expectedRevision: 2, proposal: fixture.proposal })).rejects.toMatchObject({ code: "conflict" });
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "unavailable" });
  });
});
