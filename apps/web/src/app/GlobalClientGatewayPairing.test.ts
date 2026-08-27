import { describe, expect, it } from "vitest";
import { pairingExpiryLabel, pendingPairingRequests, type ClientPairingRequest } from "./GlobalClientGatewayPairing";

const nowMs = 1_000_000;
const request = (overrides: Partial<ClientPairingRequest> = {}): ClientPairingRequest => ({
  pairingCode: "pair-1",
  requestedBySessionId: "session-1",
  expiresAt: nowMs + 30_000,
  ...overrides
});

describe("global client pairing queue", () => {
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
});