// The URL shapes the platform contracts share.
import { describe, expect, it } from "vitest";
import { isLoopbackHostname, isSameOriginPath, isSecureOrLoopbackOrigin, isSecureOrLoopbackUrl } from "../index.ts";

describe("platform URL shapes", () => {
  it("knows loopback hosts", () => {
    for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "127.8.9.10", "[::1]", "::1"]) expect(isLoopbackHostname(host)).toBe(true);
    for (const host of ["localhost.example", "128.0.0.1", "10.0.0.1", "127.0.0.256", "0.0.0.0"]) expect(isLoopbackHostname(host)).toBe(false);
  });

  it("accepts same-origin paths only", () => {
    for (const path of ["/", "/connect/authorize?x=1", "/a#b"]) expect(isSameOriginPath(path)).toBe(true);
    for (const path of ["//evil.example/x", "/\\evil.example", "https://evil.example/", "connect", "/a b", "/\u0000", ""]) expect(isSameOriginPath(path)).toBe(false);
  });

  it("requires the secure scheme off loopback", () => {
    expect(isSecureOrLoopbackUrl("https://getfluxiq.com/signup/", "http")).toBe(true);
    expect(isSecureOrLoopbackUrl("http://127.0.0.1:3000/signup", "http")).toBe(true);
    expect(isSecureOrLoopbackUrl("http://getfluxiq.com/signup/", "http")).toBe(false);
    expect(isSecureOrLoopbackUrl("wss://app.getfluxiq.com/client", "ws")).toBe(true);
    expect(isSecureOrLoopbackUrl("ws://localhost:4777", "ws")).toBe(true);
    expect(isSecureOrLoopbackUrl("ws://app.getfluxiq.com/client", "ws")).toBe(false);
    expect(isSecureOrLoopbackUrl("https://app.getfluxiq.com/client", "ws")).toBe(false);
    expect(isSecureOrLoopbackUrl("https://user:pw@getfluxiq.com/", "http")).toBe(false);
    expect(isSecureOrLoopbackUrl("https://getfluxiq.com/#x", "http")).toBe(false);
    expect(isSecureOrLoopbackUrl("not a url", "http")).toBe(false);
  });

  it("accepts canonical origins only", () => {
    expect(isSecureOrLoopbackOrigin("https://app.getfluxiq.com")).toBe(true);
    expect(isSecureOrLoopbackOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isSecureOrLoopbackOrigin("https://app.getfluxiq.com/")).toBe(false);
    expect(isSecureOrLoopbackOrigin("https://app.getfluxiq.com:443")).toBe(false);
    expect(isSecureOrLoopbackOrigin("http://app.getfluxiq.com")).toBe(false);
  });
});
