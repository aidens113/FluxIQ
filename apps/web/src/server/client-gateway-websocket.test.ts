import { describe, expect, it } from "vitest";
import { isLoopbackHost, isOriginAllowed, parseAllowedOrigins } from "./client-gateway-websocket";

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

  it("recognizes only explicit loopback listener hosts", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
  });
});
