// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayTrustedClient, type ClientGatewayTrustedClientStore } from "../../client-gateway/index.ts";
import { FluxIQ, type FluxIQHostPaths } from "../index.ts";

describe("public workspace browser trust injection", () => {
  it.each([false, true])("persists gateway pairing and restores it on a new instance (path factory: %s)", async (useFactory) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-browser-store-"));
    let rows: ClientGatewayTrustedClient[] = [];
    const store: ClientGatewayTrustedClientStore = {
      load: vi.fn(async () => structuredClone(rows)),
      save: vi.fn(async (clients) => { rows = structuredClone(clients); })
    };
    const factory = vi.fn((_paths: FluxIQHostPaths) => store);
    const options = { rootDir: root, loadEnv: false, modelProvidersEnabled: false, clientGatewayTrustedClientStore: useFactory ? factory : store };
    let fluxiq = FluxIQ.create(options);
    try {
      const gateway = fluxiq.programs.clientGateway;
      await gateway.ready();
      const session = gateway.connect();
      await gateway.receive(session.sessionId, {
        id: "hello-test", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(),
        payload: { clientId: "extension.test", clientType: "extension", name: "Test" }
      });
      const pairing = gateway.snapshot().pairings.find((entry) => entry.requestedBySessionId === session.sessionId);
      expect(pairing).toBeDefined();
      await gateway.approvePairing(pairing!.pairingCode, { approvedByUserId: "user.test" });
      expect(store.save).toHaveBeenCalled();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.approvedByUserId).toBe("user.test");
      gateway.disconnect(session.sessionId, "test complete");
      await fluxiq.close();
      fluxiq = FluxIQ.create(options);
      await fluxiq.programs.clientGateway.ready();
      expect(store.load).toHaveBeenCalledTimes(2);
      if (useFactory) expect(factory).toHaveBeenCalledWith(expect.objectContaining({ root, fluxiq: fluxiq.paths.fluxiq }));
      expect(fluxiq.programs.clientGateway.snapshot().trustedClients.map((entry) => entry.trustedClientId)).toEqual(rows.map((entry) => entry.trustedClientId));
    } finally {
      await fluxiq.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not fall back to local trust when the injected authority cannot load", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-browser-store-"));
    const fluxiq = FluxIQ.create({
      rootDir: root, loadEnv: false, modelProvidersEnabled: false,
      clientGatewayTrustedClientStore: { load: async () => { throw new Error("authority unavailable"); }, save: async () => undefined }
    });
    try {
      await expect(fluxiq.programs.clientGateway.ready()).rejects.toThrow("authority unavailable");
    } finally {
      await fluxiq.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
