// @fluxiq-test-group real-sql
import { describe, expect, it } from "vitest";
import { createAppRegistryService } from "../index.ts";
import { serviceFixture } from "./fixture.ts";

const message = "The app request could not be authorized or resolved.";

describe("app service fail-closed ports and fixed errors", () => {
  it("requires the store, every authority port and the target check", async () => {
    const fixture = await serviceFixture();
    const valid = { store: fixture.store, authority: fixture.authority, checkTarget: fixture.checkTarget };
    const malformed = [
      { ...valid, store: undefined }, { ...valid, authority: undefined }, { ...valid, checkTarget: undefined },
      ...["publication", "installation", "revocation", "operation"].map(port => ({ ...valid, authority: { ...fixture.authority, [port]: undefined } }))
    ];
    for (const config of malformed) expect(() => Reflect.apply(createAppRegistryService, undefined, [config])).toThrowError(expect.objectContaining({ code: "unavailable", message }));
  });

  it("does not leak authority-provider or target-check errors", async () => {
    const fixture = await serviceFixture();
    await fixture.service.install(fixture.context, fixture.proposal);
    const secret = "DO-NOT-RETURN-PRIVATE-DETAILS";
    fixture.authority.operation.mockRejectedValueOnce(new Error(secret));
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "unavailable", message });
    fixture.state.target = async () => { throw new Error(secret); };
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "unavailable", message });
    fixture.authority.installation.mockRejectedValueOnce(new Error(secret));
    await expect(fixture.service.update(fixture.context, { installationId: "installation.one", expectedRevision: 1, proposal: fixture.proposal })).rejects.toMatchObject({ code: "unavailable", message });
  });

  it("returns fixed diagnostics for invalid content, missing installation and closed storage", async () => {
    const fixture = await serviceFixture();
    await expect(fixture.service.registerManifest(fixture.context, { ...fixture.manifest, privateKey: "DO-NOT-ECHO" })).rejects.toMatchObject({ code: "invalid_request", message });
    await expect(fixture.service.resolveOperation(fixture.context, fixture.invocation)).rejects.toMatchObject({ code: "unavailable", message });
    await fixture.store.close();
    await expect(fixture.service.install(fixture.context, fixture.proposal)).rejects.toMatchObject({ code: "unavailable", message });
  });

  it("refuses expired publication/install authority without writing an installation", async () => {
    const fixture = await serviceFixture();
    fixture.state.publication!.expiresAtMs = fixture.state.now;
    await expect(fixture.service.registerManifest(fixture.context, fixture.manifest)).rejects.toMatchObject({ code: "forbidden", message });
    fixture.state.actor!.expiresAtMs = fixture.state.now;
    await expect(fixture.service.install(fixture.context, fixture.proposal)).rejects.toMatchObject({ code: "forbidden", message });
    expect(await fixture.store.getInstallation("installation.one")).toBeNull();
  });
});
