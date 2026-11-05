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
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { session: { sessionId: "session.1", status: "ready" }, unlocked: false } });
  });

  describe("with the person's password, which is optional", () => {
    const approved = { sessionId: "session.1", status: "ready", trustedClientId: "trusted.1" };
    let unlocks: Record<string, unknown>[] = [];
    let approvals = 0;

    beforeEach(() => {
      unlocks = [];
      approvals = 0;
      fixture.stillLocked = [];
      fixture.approvePairing = async () => {
        approvals += 1;
        return approved;
      };
      fixture.authorizeSessionCredentials = async () => ({});
      fixture.unlockSession = async (input) => {
        unlocks.push(input);
        return {};
      };
    });

    it("without it pairs fine and unlocks nothing", async () => {
      const response = await approve();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, payload: { unlocked: false } });
      expect(unlocks).toEqual([]);
    });

    it("with it unlocks exactly the browser being approved", async () => {
      const response = await approve("123456", { password: "dummy-password" });
      expect(await response.json()).toMatchObject({ ok: true, payload: { unlocked: true } });
      expect(unlocks).toHaveLength(1);
      expect(unlocks[0]).toMatchObject({ sessionId: "session.web", userId: "user.web", authorizationPassword: "dummy-password", unlockClients: ["paired-client:trusted.1"], passwordVerified: true });
    });

    it("a wrong one pairs nothing, and says so", async () => {
      fixture.authorizeSessionCredentials = async () => { throw new Error("Invalid username or credentials"); };
      const response = await approve("123456", { password: "dummy-wrong" });
      expect(response.status).toBe(403);
      expect(approvals).toBe(0);
      expect(unlocks).toEqual([]);
      const text = await response.text();
      expect(text).not.toContain("dummy-wrong");
    });

    it("says it is unlocked only when it is: a password that opened nothing lifted nothing", async () => {
      fixture.stillLocked = ["paired-client:trusted.1"];
      const response = await approve("123456", { password: "dummy-password" });
      expect(await response.json()).toMatchObject({ ok: true, payload: { unlocked: false } });
    });

    it("the browser stays paired when its unlock cannot be written: it shows the setup step instead", async () => {
      fixture.unlockSession = async () => { throw new Error("dummy store refused the write"); };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const response = await approve("123456", { password: "dummy-password" });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, payload: { unlocked: false } });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("dummy-password");
      warn.mockRestore();
    });
  });
});
