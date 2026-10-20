import { describe, expect, it } from "vitest";
import { clientGatewayReconnectDelay } from "../index.ts";

describe("clientGatewayReconnectDelay", () => {
  const bounds = { baseDelayMs: 1_000, maxDelayMs: 30_000 };

  it("starts at the base delay and doubles with each attempt", () => {
    expect([0, 1, 2, 3, 4].map((attempt) => clientGatewayReconnectDelay(attempt, bounds))).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
  });

  it("never waits longer than the cap", () => {
    expect(clientGatewayReconnectDelay(5, bounds)).toBe(30_000);
    expect(clientGatewayReconnectDelay(60, bounds)).toBe(30_000);
    expect(clientGatewayReconnectDelay(10_000, bounds)).toBe(30_000);
  });
});
