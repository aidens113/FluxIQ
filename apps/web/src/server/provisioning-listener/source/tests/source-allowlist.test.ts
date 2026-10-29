import { describe, expect, it } from "vitest";
import { DEFAULT_ALLOWED_CIDRS } from "../default-allowed-cidrs";
import { normalizePeerAddress } from "../normalize-peer-address";
import { parseCidr } from "../parse-cidr";
import { SourceAllowlist } from "../source-allowlist";

function allows(list: SourceAllowlist, remote: string): boolean {
  const peer = normalizePeerAddress(remote);
  return peer !== null && list.allows(peer);
}

describe("SourceAllowlist", () => {
  it("allows loopback and private sources by default, IPv4-mapped forms included", () => {
    const list = SourceAllowlist.fromCidrs(DEFAULT_ALLOWED_CIDRS);
    for (const remote of ["127.0.0.1", "127.8.9.10", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.254", "192.168.1.20", "::1", "fd00::1", "fc12:3456::9", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::FFFF:192.168.0.5"]) {
      expect(allows(list, remote), remote).toBe(true);
    }
  });

  it("refuses public, link-local and unspecified sources by default", () => {
    const list = SourceAllowlist.fromCidrs(DEFAULT_ALLOWED_CIDRS);
    for (const remote of ["8.8.8.8", "172.32.0.1", "172.15.255.255", "192.169.0.1", "11.0.0.1", "169.254.1.1", "0.0.0.0", "fe80::1", "2001:4860::8888", "::ffff:8.8.8.8", "::"]) {
      expect(allows(list, remote), remote).toBe(false);
    }
  });

  it("narrows to the configured entries, an IPv4-mapped entry meaning its IPv4 range", () => {
    const list = SourceAllowlist.fromCidrs(["10.0.0.0/8"]);
    expect(allows(list, "10.9.9.9")).toBe(true);
    expect(allows(list, "127.0.0.1")).toBe(false);
    const mapped = SourceAllowlist.fromCidrs(["::ffff:10.0.0.0/104"]);
    expect(allows(mapped, "10.1.1.1")).toBe(true);
    expect(allows(mapped, "::ffff:10.1.1.1")).toBe(true);
    expect(allows(mapped, "11.1.1.1")).toBe(false);
  });

  it("refuses an empty list, a public entry and an invalid one", () => {
    expect(() => SourceAllowlist.fromCidrs([])).toThrow(/names no source/u);
    expect(() => SourceAllowlist.fromCidrs(["0.0.0.0/0"])).toThrow(/not inside a loopback or private range/u);
    expect(() => SourceAllowlist.fromCidrs(["192.168.0.0/15"])).toThrow(/not inside a loopback or private range/u);
    expect(() => SourceAllowlist.fromCidrs(["10.0.0.0/8", "1.2.3.4"])).toThrow(/not inside a loopback or private range/u);
    expect(() => SourceAllowlist.fromCidrs(["10.0.0.0/x"])).toThrow(/is not a CIDR/u);
  });
});

describe("parseCidr and normalizePeerAddress", () => {
  it("reads a bare address as one host and folds an IPv4-mapped CIDR into IPv4", () => {
    expect(parseCidr("10.1.2.3")).toEqual({ family: "ipv4", address: "10.1.2.3", prefix: 32 });
    expect(parseCidr(" ::1 ")).toEqual({ family: "ipv6", address: "::1", prefix: 128 });
    expect(parseCidr("::ffff:172.16.0.0/108")).toEqual({ family: "ipv4", address: "172.16.0.0", prefix: 12 });
    expect(parseCidr("::ffff:10.0.0.0/64")).toEqual({ family: "ipv6", address: "::ffff:10.0.0.0", prefix: 64 });
  });

  it("answers null for a peer with no IP address", () => {
    expect(normalizePeerAddress(undefined)).toBeNull();
    expect(normalizePeerAddress("not-an-ip")).toBeNull();
    expect(normalizePeerAddress("::ffff:10.0.0.7")).toBe("10.0.0.7");
  });
});
