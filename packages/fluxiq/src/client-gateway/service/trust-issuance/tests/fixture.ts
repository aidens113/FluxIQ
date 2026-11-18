import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import type { ClientGatewaySocket, ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService } from "../../../index.ts";
import type { ClientGatewayServiceOptions } from "../../types.ts";
import type { ClientGatewayApprovedTrustInput, ClientGatewayTrustAuthority } from "../index.ts";
import { createSqliteClientTrustRepository } from "../../../../platform/browser-trust/index.ts";

/** Synthetic authorities, durable storage and gateway only. No real accounts, browser, server or model. */
export async function issuerFixture(cleanups: Array<() => Promise<void>>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-trust-issuer-"));
  const filePath = path.join(directory, "trust.sqlite");
  const state = { now: 1_000_000, allowed: true, maxActiveClients: 10, failSave: false };
  const sessionDigest = createHash("sha256").update("synthetic-approving-session").digest("hex");
  const sessionOwners = new Map([[sessionDigest, "user.synthetic"]]);
  const input: ClientGatewayApprovedTrustInput = { clientId: "synthetic-client", clientType: "extension", clientInstallId: "synthetic-install", name: "Synthetic client", domainId: "synthetic-domain", approvedByUserId: "user.synthetic", approvingSessionDigest: sessionDigest };
  const validateApproval = vi.fn<ClientGatewayTrustAuthority["validateApproval"]>(async ({ approvingSessionDigest }) => {
    const owner = sessionOwners.get(approvingSessionDigest);
    return state.allowed && owner ? { userId: owner, approvingSessionDigest, maxActiveClients: state.maxActiveClients } : null;
  });
  const grantCredential = vi.fn<ClientGatewayTrustAuthority["grantCredential"]>(async () => undefined);
  const authority: ClientGatewayTrustAuthority = { validateApproval, grantCredential };
  const saved: ClientGatewayTrustedClient[][] = [];
  cleanups.push(async () => {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("fluxiq-trust-issuer-")) throw new Error("Invalid synthetic issuer cleanup target.");
    await rm(resolved, { recursive: true, force: true });
  });
  const repository = createSqliteClientTrustRepository({ filePath, now: () => state.now });
  cleanups.push(() => repository.close());
  function createGateway(overrides: Partial<ClientGatewayServiceOptions> = {}) {
    const baseStore = repository.scopedStore("workspace.synthetic");
    const defaults: ClientGatewayServiceOptions = {
      now: () => state.now,
      trustAuthority: authority,
      trustedClientStore: {
        load: () => baseStore.load(),
        save: async (clients) => {
          if (state.failSave) throw new Error("synthetic-write-failed-with-private-detail");
          await baseStore.save(clients);
          saved.push(structuredClone(clients));
        }
      }
    };
    const gateway = new ClientGatewayService({ ...defaults, ...overrides });
    cleanups.push(() => gateway.close());
    return gateway;
  }
  const gateway = createGateway();
  await gateway.ready();
  async function hello(token: string, change: Partial<ClientGatewayApprovedTrustInput> = {}, socket?: ClientGatewaySocket) {
    const declared = { ...input, ...change };
    const session = gateway.connect(socket ? { socket } : {});
    await gateway.receive(session.sessionId, {
      id: "synthetic-hello",
      type: "client.hello",
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: state.now,
      payload: { clientId: declared.clientId, clientType: declared.clientType, name: declared.name, token, metadata: { domainId: declared.domainId } }
    });
    return gateway.snapshot().sessions.find((current) => current.sessionId === session.sessionId)!;
  }
  return { directory, filePath, state, input, sessionDigest, sessionOwners, validateApproval, grantCredential, authority, saved, repository, createGateway, gateway, hello };
}
