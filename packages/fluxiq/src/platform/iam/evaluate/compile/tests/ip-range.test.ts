// IPv4 and IPv6 addresses and CIDR blocks for IpAddress / NotIpAddress.
import { describe, expect, it } from "vitest";
import { compileIamIpRange } from "../ip-range.ts";

describe("compileIamIpRange", () => {
  it("matches IPv4 blocks, exact addresses and /0", () => {
    expect(compileIamIpRange("10.0.0.0/8")?.("10.255.0.1")).toBe(true);
    expect(compileIamIpRange("10.0.0.0/8")?.("11.0.0.0")).toBe(false);
    expect(compileIamIpRange("192.168.1.7")?.("192.168.1.7")).toBe(true);
    expect(compileIamIpRange("192.168.1.7")?.("192.168.1.8")).toBe(false);
    expect(compileIamIpRange("0.0.0.0/0")?.("203.0.113.9")).toBe(true);
    expect(compileIamIpRange("10.1.2.3/8")?.("10.9.9.9")).toBe(true);
  });

  it("matches IPv6 blocks, compressed forms and embedded IPv4", () => {
    expect(compileIamIpRange("2001:db8::/32")?.("2001:0db8:ffff::1")).toBe(true);
    expect(compileIamIpRange("2001:db8::/32")?.("2001:db9::1")).toBe(false);
    expect(compileIamIpRange("::1")?.("0:0:0:0:0:0:0:1")).toBe(true);
    expect(compileIamIpRange("::/0")?.("fe80::1")).toBe(true);
    expect(compileIamIpRange("10.0.0.0/8")?.("::ffff:10.1.1.1")).toBe(true);
    expect(compileIamIpRange("10.0.0.0/8")?.("::ffff:a01:101")).toBe(true);
  });

  it("never matches across families or unparseable addresses", () => {
    expect(compileIamIpRange("0.0.0.0/0")?.("2001:db8::1")).toBe(false);
    expect(compileIamIpRange("::/0")?.("10.0.0.1")).toBe(false);
    expect(compileIamIpRange("0.0.0.0/0")?.("10.0.0")).toBe(false);
    expect(compileIamIpRange("::/0")?.("1:2:3:4:5:6:7:8:9")).toBe(false);
    expect(compileIamIpRange("::/0")?.("1::2::3")).toBe(false);
  });

  it("refuses ranges that are not addresses or blocks", () => {
    for (const range of ["10.0.0.0/33", "::/129", "10.0.0.256", "10.0.0.0/8/1", "10.0.0.0/x", "host", "01.2.3.4"]) expect(compileIamIpRange(range)).toBeNull();
  });
});
