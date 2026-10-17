import { describe, expect, it, vi } from "vitest";
import { loadOnboardingGatewaySnapshot } from "../gateway-snapshot";

const summary = { enabled: true, sessions: [], pairings: [], trustedClients: [], auditLog: [], counts: { sessions: 1, pairings: 1 }, webRuntime: { clientGatewayListening: true } };
const session = { sessionId: "s1", status: "ready" };
const pairing = { pairingCode: "P1", expiresAt: 10 };

function port(overrides: { snapshot?: unknown; sessions?: unknown; pairings?: unknown } = {}) {
  const querySnapshot = vi.fn(async () => (overrides.snapshot ?? { ok: true, payload: summary }) as any);
  const listItems = vi.fn(async (input: { kind: string }) => {
    if (input.kind === "sessions") return (overrides.sessions ?? { ok: true, payload: { items: [session] } }) as any;
    return (overrides.pairings ?? { ok: true, payload: { items: [pairing] } }) as any;
  });
  return { querySnapshot, listItems };
}

describe("onboarding gateway snapshot", () => {
  it("merges the sessions and pairings lists into the snapshot summary", async () => {
    const source = port();
    const result = await loadOnboardingGatewaySnapshot(source);
    expect(result.ok).toBe(true);
    expect(result.payload).toMatchObject({ enabled: true, webRuntime: { clientGatewayListening: true }, sessions: [session], pairings: [pairing] });
    expect(source.listItems).toHaveBeenCalledWith({ kind: "sessions", limit: 200 });
    expect(source.listItems).toHaveBeenCalledWith({ kind: "pairings", limit: 200 });
  });

  it("reads a list without items as empty only when the read succeeded", async () => {
    const result = await loadOnboardingGatewaySnapshot(port({ sessions: { ok: true, payload: {} } }));
    expect(result.ok).toBe(true);
    expect(result.payload?.sessions).toEqual([]);
  });

  it("keeps a failed snapshot read as that failure", async () => {
    const result = await loadOnboardingGatewaySnapshot(port({ snapshot: { ok: false, error: "connect ECONNREFUSED" } }));
    expect(result).toEqual({ ok: false, error: "connect ECONNREFUSED" });
  });

  it("surfaces a failed sessions list as a failure, never as no sessions", async () => {
    const result = await loadOnboardingGatewaySnapshot(port({ sessions: { ok: false, error: "sessions unavailable" } }));
    expect(result).toEqual({ ok: false, error: "sessions unavailable" });
  });

  it("surfaces a failed pairings list with a fallback error when none is given", async () => {
    const result = await loadOnboardingGatewaySnapshot(port({ pairings: { ok: false } }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Pairing requests could not be read.");
  });

  it("treats a list payload with non-array items as a failed read", async () => {
    const result = await loadOnboardingGatewaySnapshot(port({ sessions: { ok: true, payload: { items: "s1" } } }));
    expect(result).toEqual({ ok: false, error: "Connected browsers could not be read." });
  });
});
