import { describe, expect, it } from "vitest";
import { isClientGatewayHostLease } from "../index.ts";

const lease = { resourceKey: "resource-1", epoch: 1, holder: { role: "builder", briefId: "brief.a" } };

describe("isClientGatewayHostLease", () => {
  it("accepts exactly a lease", () => {
    expect(isClientGatewayHostLease(lease)).toBe(true);
    expect(isClientGatewayHostLease({ ...lease, epoch: 0 })).toBe(true);
  });

  it.each([
    ["null", null],
    ["an array", [lease]],
    ["an empty resource key", { ...lease, resourceKey: "" }],
    ["a fractional epoch", { ...lease, epoch: 1.5 }],
    ["a string epoch", { ...lease, epoch: "1" }],
    ["an extra field", { ...lease, extra: true }],
    ["a missing holder", { resourceKey: "resource-1", epoch: 1 }],
    ["an empty role", { ...lease, holder: { role: "", briefId: "brief.a" } }],
    ["an extra holder field", { ...lease, holder: { ...lease.holder, extra: 1 } }],
    ["a missing brief id", { ...lease, holder: { role: "builder" } }]
  ])("refuses %s", (_name, value) => {
    expect(isClientGatewayHostLease(value)).toBe(false);
  });
});
