import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain function rather than vi.fn: a vi.fn whose promise rejects is also
// reported to the test as an unhandled rejection, which hides the result.
const fixture = vi.hoisted(() => ({
  approvePairing: async (_code: string, _input: { approvedByUserId: string }): Promise<unknown> => null,
  authorizeSessionCredentials: async (_input: Record<string, unknown>): Promise<unknown> => ({}),
  unlockSession: async (_input: Record<string, unknown>): Promise<unknown> => ({}),
  stillLocked: [] as string[]
}));

vi.mock("../../../../../lib/auth", () => ({
  requireFluxIQUser: async () => ({ session: { id: "session.web", expiresAtMs: 5_000 }, user: { id: "user.web" }, role: { id: "role.web", permissions: ["runtime.control"] } })
}));
// A real registry on the local profile decides the route, as live.
vi.mock("../../../../../lib/fluxiq", async () => {
  const { GlobalProgramApiRegistry } = await import("fluxiq");
  const api = new GlobalProgramApiRegistry();
  return { getFluxIQ: () => ({ programs: { api, identityAccess: { authorizeSessionCredentials: (input: Record<string, unknown>) => fixture.authorizeSessionCredentials(input) }, secretKeys: { unlockSession: (input: Record<string, unknown>) => fixture.unlockSession(input), credentialUnlocks: { lockedClientsFor: async () => fixture.stillLocked.map((holderId) => ({ holderId, label: "Chrome" })) } }, clientGateway: { approvePairing: (code: string, input: { approvedByUserId: string }) => fixture.approvePairing(code, input) } } }) };
});

import { POST } from "../route";

function approve(pairingCode = "123456", proof: Record<string, string> = {}): Promise<Response> {
  return POST(new Request("http://localhost/api/client-gateway/approve-pairing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairingCode, ...proof })
  }));
}

// t707 C2: approving a pairing whose browser has gone away must tell the
// person why, not report success and not a generic "not found".
describe("POST /api/client-gateway/approve-pairing", () => {
  beforeEach(() => { fixture.approvePairing = async () => null; });

  it("reports the gateway's reason when the pairing's client is no longer waiting", async () => {
    const message = "The browser disconnected before this pairing was approved. Reconnect from the browser to get a new code.";
    fixture.approvePairing = async () => { throw Object.assign(new Error(message), { code: "pairing.client_disconnected" }); };

    const response = await approve();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, error: message, code: "pairing.client_disconnected" });
  });

  it("does not turn an unexpected failure into a pairing refusal", async () => {
    fixture.approvePairing = async () => { throw new Error("disk full at /secret/path"); };

    const failure: unknown = await approve().then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("disk full");
  });

  it("returns the paired session on success", async () => {
    fixture.approvePairing = async () => ({ sessionId: "session.1", status: "ready" });

    const response = await approve();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { session: { sessionId: "session.1", status: "ready" } } });
  });

  it("does not require or consume legacy password fields for an authenticated approval", async () => {
    const approved = { sessionId: "session.1", status: "ready", trustedClientId: "trusted.1" };
    fixture.approvePairing = async () => approved;
    fixture.authorizeSessionCredentials = async () => { throw new Error("Must not request another password"); };
    fixture.unlockSession = async () => { throw new Error("Must not invoke the removed unlock ceremony"); };
    const response = await approve("123456", { password: "ignored-legacy-value", totp: "ignored" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, payload: { session: approved } });
  });
});
