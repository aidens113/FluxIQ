import { describe, expect, it } from "vitest";
import { clientAddressPrefix, resolveClientAddress } from "../index.ts";

describe("resolveClientAddress", () => {
  it("uses the peer when the proxy is not trusted, ignoring forwarded values", () => {
    expect(resolveClientAddress({ peerAddress: "10.0.0.1", forwardedFor: "1.2.3.4", trustProxy: false })).toEqual({ address: "10.0.0.1", source: "peer" });
  });
  it("uses the rightmost non-empty forwarded entry when trusted", () => {
    expect(resolveClientAddress({ peerAddress: "10.0.0.1", forwardedFor: "9.9.9.9, 1.2.3.4 ,", trustProxy: true })).toEqual({ address: "1.2.3.4", source: "forwarded" });
  });
  it("falls back to the peer on garbage or an empty header", () => {
    expect(resolveClientAddress({ peerAddress: "10.0.0.1", forwardedFor: "1.2.3.4, not-an-ip", trustProxy: true })).toEqual({ address: "10.0.0.1", source: "peer" });
    expect(resolveClientAddress({ peerAddress: "10.0.0.1", forwardedFor: " , ", trustProxy: true })).toEqual({ address: "10.0.0.1", source: "peer" });
    expect(resolveClientAddress({ peerAddress: "10.0.0.1", forwardedFor: "999.1.1.1", trustProxy: true }).source).toBe("peer");
  });
  it("reports none when nothing is a valid address", () => {
    expect(resolveClientAddress({ peerAddress: undefined, forwardedFor: "junk", trustProxy: true })).toEqual({ address: null, source: "none" });
    expect(resolveClientAddress({ peerAddress: "bad", forwardedFor: null, trustProxy: false })).toEqual({ address: null, source: "none" });
  });
  it("strips IPv4-mapped prefixes, brackets and ports", () => {
    expect(resolveClientAddress({ peerAddress: "::ffff:192.168.1.5", forwardedFor: null, trustProxy: false }).address).toBe("192.168.1.5");
    expect(resolveClientAddress({ peerAddress: "::ffff:c0a8:0105", forwardedFor: null, trustProxy: false }).address).toBe("192.168.1.5");
    expect(resolveClientAddress({ peerAddress: "1.2.3.4:5555", forwardedFor: null, trustProxy: false }).address).toBe("1.2.3.4");
    expect(resolveClientAddress({ peerAddress: "[2001:DB8::1]:443", forwardedFor: null, trustProxy: false }).address).toBe("2001:db8::1");
    expect(resolveClientAddress({ peerAddress: "x", forwardedFor: "::ffff:1.2.3.4", trustProxy: true }).address).toBe("1.2.3.4");
  });
});

describe("clientAddressPrefix", () => {
  it("gives /24 for IPv4", () => {
    expect(clientAddressPrefix("203.0.113.77")).toBe("203.0.113.0/24");
    expect(clientAddressPrefix("::ffff:203.0.113.77")).toBe("203.0.113.0/24");
  });
  it("gives the first 48 bits for IPv6", () => {
    expect(clientAddressPrefix("2001:db8:abcd:1234::1")).toBe("2001:db8:abcd::/48");
    expect(clientAddressPrefix("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(clientAddressPrefix("::1")).toBe("0:0:0::/48");
  });
  it("gives null for nothing or garbage", () => {
    expect(clientAddressPrefix(null)).toBeNull();
    expect(clientAddressPrefix("nope")).toBeNull();
  });
});
