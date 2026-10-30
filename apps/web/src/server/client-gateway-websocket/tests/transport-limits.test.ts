import { describe, expect, it } from "vitest";
import { resolveClientGatewayTransportLimits } from "../transport-limits.ts";

describe("resolveClientGatewayTransportLimits", () => {
  it("keeps a local install's behaviour for every limit left out", () => {
    expect(resolveClientGatewayTransportLimits(undefined)).toEqual({
      maxFrameBytes: 256 * 1024 * 1024,
      helloDeadlineMs: null,
      messagesPerSecond: null,
      messageBurst: null,
      pendingPairingsPerAddress: null,
      pendingPairingsTotal: 1000
    });
  });

  it("takes what is given, null included", () => {
    expect(resolveClientGatewayTransportLimits({ maxFrameBytes: 4096, helloDeadlineMs: 10_000, messagesPerSecond: 50, messageBurst: 200 })).toMatchObject({ maxFrameBytes: 4096, helloDeadlineMs: 10_000, messagesPerSecond: 50, messageBurst: 200 });
  });

  it("refuses a value that is not a positive whole number", () => {
    expect(() => resolveClientGatewayTransportLimits({ maxFrameBytes: 0 })).toThrow(/maxFrameBytes/);
    expect(() => resolveClientGatewayTransportLimits({ helloDeadlineMs: 1.5 })).toThrow(/helloDeadlineMs/);
    expect(() => resolveClientGatewayTransportLimits({ pendingPairingsTotal: null as unknown as number })).toThrow(/pendingPairingsTotal/);
  });
});
