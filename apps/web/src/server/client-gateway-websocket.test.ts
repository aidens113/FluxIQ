import { describe, expect, it } from "vitest";
import { isOriginAllowed, parseAllowedOrigins } from "./client-gateway-websocket";

describe("client gateway websocket server helpers", () => {
  it("parses allowed origins from env-style comma lists", () => {
    expect(parseAllowedOrigins("chrome-extension://abc, moz-extension://def ")).toEqual([
      "chrome-extension://abc",
      "moz-extension://def"
    ]);
    expect(parseAllowedOrigins("  ")).toBeUndefined();
  });

  it("allows all origins until an allow-list is configured", () => {
    expect(isOriginAllowed("chrome-extension://abc")).toBe(true);
    expect(isOriginAllowed("chrome-extension://abc", ["chrome-extension://abc"])).toBe(true);
    expect(isOriginAllowed("chrome-extension://other", ["chrome-extension://abc"])).toBe(false);
    expect(isOriginAllowed(undefined, ["chrome-extension://abc"])).toBe(false);
  });
});
