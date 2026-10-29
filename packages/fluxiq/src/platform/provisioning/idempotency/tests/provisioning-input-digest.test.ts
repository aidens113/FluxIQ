import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical-json.ts";
import { provisioningInputDigest } from "../provisioning-input-digest.ts";

describe("provisioningInputDigest", () => {
  it("ignores key order and the password, and differs for any other field", () => {
    const base = provisioningInputDigest({ requestId: "r", email: "a@example.test", policies: ["A", "B"] });
    expect(provisioningInputDigest({ policies: ["A", "B"], email: "a@example.test", requestId: "r", password: "anything at all" })).toBe(base);
    expect(provisioningInputDigest({ requestId: "r", email: "a@example.test", policies: ["B", "A"] })).not.toBe(base);
    expect(provisioningInputDigest({ requestId: "r", email: "b@example.test", policies: ["A", "B"] })).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("serialises nested objects with sorted keys", () => {
    expect(canonicalJson({ b: { d: 1, c: [{ f: 2, e: 3 }] }, a: undefined })).toBe('{"b":{"c":[{"e":3,"f":2}],"d":1}}');
  });
});
