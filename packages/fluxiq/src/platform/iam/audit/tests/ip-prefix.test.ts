import { describe, expect, it } from "vitest";
import { iamIpPrefix } from "../ip-prefix.ts";

describe("iamIpPrefix", () => {
  it.each([
    [undefined, null],
    ["", null],
    ["not-an-ip", null],
    ["203.0.113.7", "203.0.113.0/24"],
    ["::ffff:203.0.113.7", "203.0.113.0/24"],
    ["2001:db8:1:2::7", "2001:db8:1::/48"],
    ["2001:0db8:0001:0002:0000:0000:0000:0007", "2001:db8:1::/48"],
    ["::1", "0:0:0::/48"],
    ["fe80::1", "fe80:0:0::/48"]
  ])("%s -> %s", (input, expected) => {
    expect(iamIpPrefix(input)).toBe(expected);
  });
});
