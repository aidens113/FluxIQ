import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService } from "fluxiq/client-gateway";
import { createSqliteClientTrustRepository } from "fluxiq/platform";
import type { WorkspaceLease } from "../../../lib/workspaces";
import { describe, expect, it, vi } from "vitest";
import { resolveTrustedClientHttpRoute } from "../resolve-http-route";

describe("HTTP proof and real owning gateway integration", () => {
  it("isolates colliding installation ids, requires a live session, and observes durable revocation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-http-trust-"));
    const repository = createSqliteClientTrustRepository({ filePath: path.join(directory, "trust.sqlite") });
    const gateways = new Map<string, ClientGatewayService>();
    try {
      const tokens = new Map<string, string>();
      for (const suffix of ["a", "b"]) {
        const gateway = new ClientGatewayService({
          trustedClientStore: repository.scopedStore(`tenant-${suffix}`),
          trustAuthority: {
            validateApproval: async ({ userId, approvingSessionDigest }) => ({ userId, approvingSessionDigest, maxActiveClients: 10 }),
            grantCredential: async () => undefined
          }
        });
        gateways.set(`tenant-${suffix}`, gateway);
        await gateway.ready();
        const issued = await gateway.trust.issue({ clientId: "same-installation", clientInstallId: "same-installation", clientType: "extension", name: "Synthetic browser", domainId: "web", approvedByUserId: `person-${suffix}`, approvingSessionDigest: suffix.repeat(64) });
        tokens.set(suffix, issued.credential);
      }
      const release = vi.fn();
      const acquire = vi.fn(async (workspaceId: string) => {
        const gateway = gateways.get(workspaceId);
        if (!gateway) throw new Error("Unexpected workspace selection");
        return { workspaceId, fluxiq: { programs: { clientGateway: gateway } }, release } as unknown as WorkspaceLease;
      });
      const deps = { repository, primaryWorkspaceId: "workspace-main", authorize: async () => true, acquire };
      const first = await resolveTrustedClientHttpRoute(tokens.get("a")!, deps);
      expect(first?.lease.workspaceId).toBe("tenant-a");
      expect(await first?.lease.fluxiq.programs.clientGateway.authorizeToken(tokens.get("a")!)).toBeNull();
      first?.lease.release();
      const gateway = gateways.get("tenant-a")!;
      const session = gateway.connect();
      await gateway.receive(session.sessionId, {
        id: "synthetic-hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello",
        payload: { clientId: "same-installation", clientType: "extension", name: "Synthetic browser", token: tokens.get("a")!, metadata: { domainId: "web" } }
      });
      const connected = await resolveTrustedClientHttpRoute(tokens.get("a")!, deps);
      expect(await connected?.lease.fluxiq.programs.clientGateway.authorizeToken(tokens.get("a")!)).toMatchObject({ sessionId: session.sessionId, operatorUserId: "person-a" });
      expect(await gateways.get("tenant-b")!.authorizeToken(tokens.get("a")!)).toBeNull();
      const second = await resolveTrustedClientHttpRoute(tokens.get("b")!, deps);
      expect(second?.lease.workspaceId).toBe("tenant-b");
      expect(acquire.mock.calls.map(([workspaceId]) => workspaceId)).toEqual(["tenant-a", "tenant-a", "tenant-b"]);
      const proof = await repository.lookupCredential(tokens.get("a")!);
      if (proof.status === "invalid") throw new Error("Expected a proved credential");
      await gateway.revokeTrustedClient(proof.binding.trustedClientId, "Synthetic revocation");
      expect(await connected?.revalidateAuthority()).toBe(false);
      expect(await resolveTrustedClientHttpRoute(tokens.get("a")!, deps)).toBeNull();
      expect(await second?.revalidateAuthority()).toBe(true);
      connected?.lease.release();
      second?.lease.release();
      expect(release).toHaveBeenCalledTimes(3);
    } finally {
      for (const gateway of gateways.values()) await gateway.close();
      await repository.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("fluxiq-http-trust-")) throw new Error("Invalid synthetic cleanup target");
      await rm(directory, { recursive: true, force: true });
    }
  });
});
