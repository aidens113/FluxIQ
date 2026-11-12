import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { forgetPairedClient, loadAccess, loadKeyRows, loadPairedClients, revokeSession } from "../index";

const signal = new AbortController().signal;

type Answer = { ok: boolean; status?: number; payload?: unknown };
function transport(answer: Answer, calls: Array<[string, unknown]> = []): ProgramCommandTransport {
  return {
    get: (endpoint: string) => {
      calls.push([endpoint, undefined]);
      return Promise.resolve(answer);
    },
    post: (endpoint: string, payload: unknown) => {
      calls.push([endpoint, payload]);
      return Promise.resolve(answer);
    }
  } as ProgramCommandTransport;
}

afterEach(() => vi.unstubAllGlobals());

describe("loadKeyRows", () => {
  it("shapes the keys and carries no value", async () => {
    const answer = { ok: true, payload: { keys: [
      { id: "k1", name: "Work", provider: "Anthropic", kind: "llm", enabled: true, unlocked: false, createdAtMs: 5, lastRevealedAtMs: 9, value: "sk-SECRET", sealed: { ciphertext: "SECRET" } },
      { id: "k2", name: "Home", kind: "llm", enabled: true, unlocked: true, createdAtMs: 6 },
      { name: "no id" }
    ] } };
    const result = await loadKeyRows(transport(answer), signal);
    expect(result).toEqual({ state: "ready", data: [
      { id: "k1", name: "Work", provider: "Anthropic", addedAt: 5, lastRevealedAt: 9, enabled: true, lock: "locked" },
      { id: "k2", name: "Home", provider: "llm", addedAt: 6, lastRevealedAt: undefined, enabled: true, lock: "unlocked" }
    ] });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("reports a refusal as denied and any other failure as a throw", async () => {
    expect(await loadKeyRows(transport({ ok: false, status: 403 }), signal)).toEqual({ state: "denied" });
    await expect(loadKeyRows(transport({ ok: false, status: 500 }), signal)).rejects.toThrow();
  });
});

describe("loadAccess", () => {
  it("joins people, role permissions and sessions by digest", async () => {
    const answer = { ok: true, payload: {
      users: [{ id: "u1", username: "ana", displayName: "Ana", roleId: "admin", enabled: true }],
      roles: [{ id: "admin", permissions: ["identity.manage"] }],
      sessions: [{ id: "digest-1", userId: "u1", expiresAtMs: 100 }, { id: "digest-2", userId: "ghost", expiresAtMs: 200 }]
    } };
    const result = await loadAccess(transport(answer), signal);
    expect(result).toEqual({ state: "ready", data: {
      people: [{ id: "u1", name: "Ana", username: "ana", roleId: "admin", permissions: ["identity.manage"], enabled: true, sessions: [{ digest: "digest-1", expiresAt: 100 }] }],
      otherSessions: [{ digest: "digest-2", expiresAt: 200 }]
    } });
  });
  it("reports a refusal as denied and any other failure as a throw", async () => {
    expect(await loadAccess(transport({ ok: false, status: 403 }), signal)).toEqual({ state: "denied" });
    await expect(loadAccess(transport({ ok: false }), signal)).rejects.toThrow();
  });
});

describe("loadPairedClients", () => {
  function respond(status: number, body: unknown) {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body })));
  }
  it("reads the trusted browsers and drops credential fields", async () => {
    respond(200, { ok: true, payload: { trustedClients: [{ trustedClientId: "t1", name: "Chrome", clientType: "extension", status: "active", approvedAt: 1, lastUsedAt: 2, tokenHash: "HASH" }] } });
    const result = await loadPairedClients(signal);
    expect(result).toEqual({ state: "ready", data: [{ trustedClientId: "t1", name: "Chrome", clientType: "extension", status: "active", approvedAt: 1, lastUsedAt: 2 }] });
    expect(JSON.stringify(result)).not.toContain("HASH");
  });
  it("reports a refusal as denied and any other failure as a throw", async () => {
    respond(403, { ok: false });
    expect(await loadPairedClients(signal)).toEqual({ state: "denied" });
    respond(500, { ok: false });
    await expect(loadPairedClients(signal)).rejects.toThrow();
    respond(200, { ok: false });
    await expect(loadPairedClients(signal)).rejects.toThrow();
  });
});

describe("changes", () => {
  it("revokes a session by digest and maps the answer", async () => {
    const calls: Array<[string, unknown]> = [];
    expect(await revokeSession(transport({ ok: true }, calls), "d1")).toBe("done");
    expect(calls).toEqual([["revoke-session", { sessionDigest: "d1" }]]);
    expect(await revokeSession(transport({ ok: false, status: 403 }), "d1")).toBe("denied");
    expect(await revokeSession(transport({ ok: false, status: 500 }), "d1")).toBe("failed");
  });
  it("forgets a paired browser through revoke-client-trust and maps the answer", async () => {
    const calls: Array<[string, unknown]> = [];
    expect(await forgetPairedClient(transport({ ok: true }, calls), "t1")).toBe("done");
    expect(calls[0]?.[0]).toBe("revoke-client-trust");
    expect((calls[0]?.[1] as { trustedClientId: string }).trustedClientId).toBe("t1");
    expect(await forgetPairedClient(transport({ ok: false, status: 403 }), "t1")).toBe("denied");
    expect(await forgetPairedClient(transport({ ok: false }), "t1")).toBe("failed");
  });
});
