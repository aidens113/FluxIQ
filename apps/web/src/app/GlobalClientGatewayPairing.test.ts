import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pairingExpiryLabel, pairingSnapshot, pairingSnapshotsEqual, pendingPairingRequests, type ClientPairingRequest } from "./GlobalClientGatewayPairing";

const nowMs = 1_000_000;
const request = (overrides: Partial<ClientPairingRequest> = {}): ClientPairingRequest => ({
  pairingCode: "pair-1",
  requestedBySessionId: "session-1",
  expiresAt: nowMs + 30_000,
  ...overrides
});

describe("Global client pairing dismissal", () => {
  it("keeps only active, requested, non-dismissed pairings in stable order", () => {
    const pairings = [
      request(),
      request({ pairingCode: "expired", expiresAt: nowMs - 1 }),
      request({ pairingCode: "consumed", consumedAt: nowMs }),
      request({ pairingCode: "dismissed" }),
      request({ pairingCode: "pair-2", requestedBySessionId: "session-2" })
    ];
    expect(pendingPairingRequests(pairings, nowMs, ["dismissed"]).map((item) => item.pairingCode)).toEqual(["pair-1", "pair-2"]);
  });

  it("formats a live expiry countdown without negative values", () => {
    expect(pairingExpiryLabel(nowMs + 1_500, nowMs)).toBe("Expires in 2s");
    expect(pairingExpiryLabel(nowMs - 1, nowMs)).toBe("Expired");
  });

  it("keeps modal dismissal local and reserves rejection for the Reject action", () => {
    const source = readFileSync(new URL("./GlobalClientGatewayPairing.tsx", import.meta.url), "utf8");
    expect(source).toContain("onClose={dismissPairingPrompt}");
    expect(source).toContain('onClick={() => void resolvePairing("reject")}');
    expect(source).not.toContain('onClose={() => void resolvePairing("reject")}');
  });

  it("projects only pairing data and preserves equivalent snapshot identity", () => {
    const current = pairingSnapshot({
      sessions: [{ sessionId: "session-1", name: "Browser" }],
      pairings: [request()],
      webRuntime: { clientGatewayListening: true }
    });
    const next = pairingSnapshot({
      sessions: [{ sessionId: "session-1", name: "Browser" }],
      pairings: [request()],
      webRuntime: { clientGatewayListening: true }
    });
    expect(pairingSnapshotsEqual(current, next)).toBe(true);
  });

  it("mounts the poller only for authenticated users allowed to control runtime", () => {
    const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain('auth?.role.permissions.includes("runtime.control")');
    expect(layout).toContain("pairingEligible ? <GlobalClientGatewayPairing /> : null");
  });
});
