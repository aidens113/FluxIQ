import { vi } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService,
  type ClientGatewayClientMessage, type ClientGatewayServiceOptions, type ClientGatewayTrustedClient
} from "../../../index.ts";
import type { ClientGatewayCredentialCustody } from "../../credential-custody.ts";
import type { ClientGatewaySessionRegistry } from "../../sessions.ts";
import type { ClientGatewayTrustedClientRegistry } from "../../trusted-clients.ts";
import type { ClientGatewaySessionMetadataProvider } from "../index.ts";

export const SUMMARY = {
  user: { userId: "user.metadata", displayName: "Metadata User", email: "metadata@example.test" },
  workspace: { workspaceId: "workspace.metadata", name: "workspace.metadata" }
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function harness(options: ClientGatewayServiceOptions & { local?: boolean } = {}) {
  const { local, ...settings } = options;
  const clock = { now: 1_000_000 };
  const saved: { clients: ClientGatewayTrustedClient[]; beforeSave?: (clients: ClientGatewayTrustedClient[]) => Promise<void> } = { clients: [] };
  const provider = vi.fn<ClientGatewaySessionMetadataProvider>(async () => structuredClone(SUMMARY));
  const custody = {
    issued: vi.fn<ClientGatewayCredentialCustody["issued"]>(async () => undefined),
    confirmed: vi.fn<ClientGatewayCredentialCustody["confirmed"]>(async () => undefined),
    rotating: vi.fn<ClientGatewayCredentialCustody["rotating"]>(async () => undefined),
    presented: vi.fn<ClientGatewayCredentialCustody["presented"]>(async () => undefined),
    forgotten: vi.fn<ClientGatewayCredentialCustody["forgotten"]>(async () => undefined),
    released: vi.fn<ClientGatewayCredentialCustody["released"]>(() => undefined)
  };
  let issued = 0;
  const gateway = new ClientGatewayService({
    now: () => clock.now, createToken: () => `synthetic.metadata.${++issued}`, credentialCustody: custody,
    trustedClientStore: { load: async () => structuredClone(saved.clients), save: async (clients) => {
      await saved.beforeSave?.(clients);
      saved.clients = structuredClone(clients);
    } },
    ...(local ? {} : { sessionMetadata: provider }), ...settings
  });
  const registry = (gateway as unknown as { trustedClients: ClientGatewayTrustedClientRegistry }).trustedClients;
  const sessions = (gateway as unknown as { lifecycle: { sessions: ClientGatewaySessionRegistry } }).lifecycle.sessions;
  const readyEvents: string[] = [];
  gateway.onEvent((event) => {
    if (event.type === "session.ready") readyEvents.push(event.session.sessionId);
  });
  return { gateway, registry, sessions, provider, custody, saved, clock, readyEvents };
}

export function hello(token?: string): ClientGatewayClientMessage {
  return {
    id: "message.metadata", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1,
    payload: { clientId: "extension.metadata", clientType: "extension", name: "Metadata Browser", ...(token ? { token } : {}) }
  };
}

export async function waiting(gateway: ClientGatewayService) {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, hello());
  const code = gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)!.pairingCode;
  return { sessionId: session.sessionId, approve: () => gateway.approvePairing(code, { approvedByUserId: SUMMARY.user.userId, approvedBySessionId: "panel.session.no-longer-needed" }) };
}

export function ready(gateway: ClientGatewayService, sessionId: string) {
  return gateway.outbound(sessionId).filter((message) => message.type === "server.session_ready").at(-1)?.payload;
}

export async function pair(gateway: ClientGatewayService) {
  const pending = await waiting(gateway);
  await pending.approve();
  const payload = ready(gateway, pending.sessionId);
  if (!payload) throw new Error("Expected a ready metadata fixture.");
  return { sessionId: pending.sessionId, token: payload.token };
}
