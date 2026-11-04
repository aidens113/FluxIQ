import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../index.ts";
import type { ClientGatewayCredentialCustody } from "../credential-custody.ts";

// The gateway tells credential custody each moment it handles a credential it
// verified, and only then, and custody can never fail what the gateway was doing.

type Heard = { step: string; credential?: string | undefined; previousCredential?: string; nextCredential?: string; approvedBySessionId?: string | undefined; trustedClientId: string };

function listening(options: { failing?: boolean } = {}): { custody: ClientGatewayCredentialCustody; heard: Heard[] } {
  const heard: Heard[] = [];
  const hear = (entry: Heard): void => {
    heard.push(entry);
    if (options.failing) throw new Error("dummy store refused the write");
  };
  return {
    heard,
    custody: {
      issued: async ({ holder, credential, approvedBySessionId }) => hear({ step: "issued", trustedClientId: holder.trustedClientId, credential, approvedBySessionId }),
      confirmed: async ({ holder, credential }) => hear({ step: "confirmed", trustedClientId: holder.trustedClientId, credential }),
      rotating: async ({ holder, previousCredential, nextCredential }) => hear({ step: "rotating", trustedClientId: holder.trustedClientId, previousCredential, nextCredential }),
      presented: async ({ holder, credential }) => hear({ step: "presented", trustedClientId: holder.trustedClientId, credential }),
      released: (trustedClientId) => hear({ step: "released", trustedClientId }),
      forgotten: async (trustedClientId) => hear({ step: "forgotten", trustedClientId })
    }
  };
}

function clientMessage<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1, payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

function credentialIn(gateway: ClientGatewayService, sessionId: string): string {
  const ready = gateway.outbound(sessionId).filter((message) => message.type === "server.session_ready").at(-1);
  return (ready?.payload as { token: string }).token;
}

async function paired(gateway: ClientGatewayService): Promise<{ sessionId: string; token: string; trustedClientId: string }> {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.custody", clientType: "extension", name: "Chrome" }));
  const pairingCode = gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "";
  await gateway.approvePairing(pairingCode, { approvedByUserId: "user.web", approvedBySessionId: "session.web" });
  return { sessionId: session.sessionId, token: credentialIn(gateway, session.sessionId), trustedClientId: gateway.snapshot().trustedClients[0]?.trustedClientId ?? "" };
}

describe("credential custody", () => {
  it("hears a pairing with its credential and the session that approved it, before the browser does", async () => {
    const { custody, heard } = listening();
    const gateway = new ClientGatewayService({ credentialCustody: custody });
    const { token, trustedClientId } = await paired(gateway);
    expect(heard).toEqual([{ step: "issued", trustedClientId, credential: token, approvedBySessionId: "session.web" }]);
  });

  it("hears a reconnect: the rotation written ahead, then the new credential, which is what the browser receives", async () => {
    const { custody, heard } = listening();
    const gateway = new ClientGatewayService({ credentialCustody: custody });
    const { token, sessionId, trustedClientId } = await paired(gateway);
    gateway.disconnect(sessionId, "socket closed");
    heard.length = 0;
    const next = gateway.connect();
    await gateway.receive(next.sessionId, clientMessage("client.hello", { clientId: "extension.custody", clientType: "extension", name: "Chrome", token }));
    const rotated = credentialIn(gateway, next.sessionId);
    expect(rotated).not.toBe(token);
    expect(heard).toEqual([
      { step: "confirmed", trustedClientId, credential: token },
      { step: "rotating", trustedClientId, previousCredential: token, nextCredential: rotated },
      { step: "presented", trustedClientId, credential: rotated }
    ]);
  });

  it("writes the rotation ahead of the digest: if it dies there, the old credential is still the accepted one", async () => {
    let seenBefore = "";
    const gateway: ClientGatewayService = new ClientGatewayService({
      credentialCustody: {
        ...listening().custody,
        rotating: async ({ previousCredential }) => {
          // No socket is ready here, so it reads the trust directly: the digest has not changed yet.
          expect(gateway.snapshot().trustedClients).toHaveLength(1);
          seenBefore = previousCredential;
        }
      }
    });
    const { token } = await paired(gateway);
    const next = gateway.connect();
    await gateway.receive(next.sessionId, clientMessage("client.hello", { clientId: "extension.custody", clientType: "extension", name: "Chrome", token }));
    expect(seenBefore).toBe(token);
    expect(credentialIn(gateway, next.sessionId)).not.toBe(token);
  });

  it("hears a request's bearer token only once it is verified", async () => {
    const { custody, heard } = listening();
    const gateway = new ClientGatewayService({ credentialCustody: custody });
    const { token, trustedClientId } = await paired(gateway);
    heard.length = 0;
    await expect(gateway.authorizeToken("dummy-not-a-credential")).resolves.toBeNull();
    expect(heard).toEqual([]);
    await gateway.authorizeToken(token);
    expect(heard).toEqual([{ step: "presented", trustedClientId, credential: token }]);
  });

  it("hears a wrong credential on hello not at all", async () => {
    const { custody, heard } = listening();
    const gateway = new ClientGatewayService({ credentialCustody: custody });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.custody", clientType: "extension", name: "Chrome", token: "dummy-not-a-credential" }));
    expect(heard).toEqual([]);
  });

  it("is released when the last socket goes, and not when a reconnect replaces one", async () => {
    const { custody, heard } = listening();
    const gateway = new ClientGatewayService({ credentialCustody: custody });
    const { token, sessionId, trustedClientId } = await paired(gateway);
    heard.length = 0;
    const next = gateway.connect();
    await gateway.receive(next.sessionId, clientMessage("client.hello", { clientId: "extension.custody", clientType: "extension", name: "Chrome", token }));
    expect(heard.some((entry) => entry.step === "released")).toBe(false);
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status).toBe("disconnected");
    gateway.disconnect(next.sessionId, "socket closed");
    expect(heard.filter((entry) => entry.step === "released")).toEqual([{ step: "released", trustedClientId }]);
  });

  it("forgets on an operator's revoke, and on the person's Forget from the browser, whose credential then speaks for nobody", async () => {
    for (const revoke of ["operator", "browser"] as const) {
      const { custody, heard } = listening();
      const gateway = new ClientGatewayService({ credentialCustody: custody });
      const { token, sessionId, trustedClientId } = await paired(gateway);
      if (revoke === "operator") await gateway.revokeTrustedClient(trustedClientId);
      else await gateway.receive(sessionId, clientMessage("client.forget_pairing", {}));
      expect(heard.filter((entry) => entry.step === "forgotten")).toEqual([{ step: "forgotten", trustedClientId }]);
      await expect(gateway.authorizeToken(token)).resolves.toBeNull();
      expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status).toBe("disconnected");
    }
  });

  it("ignores a Forget from a session that is not paired", async () => {
    const { custody, heard } = listening();
    const gateway = new ClientGatewayService({ credentialCustody: custody });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.custody", clientType: "extension", name: "Chrome" }));
    await gateway.receive(session.sessionId, clientMessage("client.forget_pairing", {}));
    expect(heard).toEqual([]);
  });

  it("never fails pairing or reconnecting when custody fails, and audits the step with no credential in it", async () => {
    const { custody } = listening({ failing: true });
    const gateway = new ClientGatewayService({ credentialCustody: custody });
    const { token, sessionId } = await paired(gateway);
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status).toBe("ready");
    await expect(gateway.authorizeToken(token)).resolves.toMatchObject({ sessionId });
    const next = gateway.connect();
    await gateway.receive(next.sessionId, clientMessage("client.hello", { clientId: "extension.custody", clientType: "extension", name: "Chrome", token }));
    const rotated = credentialIn(gateway, next.sessionId);
    const audit = gateway.snapshot().auditLog;
    expect(audit.some((entry) => entry.type === "credential_custody.failed")).toBe(true);
    const written = JSON.stringify(audit);
    expect(written).not.toContain(token);
    expect(written).not.toContain(rotated);
    expect(written).not.toContain("dummy store refused");
  });
});
