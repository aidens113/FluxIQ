import { describe, expect, it } from "vitest";
import { formatProofTime, stringToSign } from "../string-to-sign.ts";

describe("stringToSign", () => {
  it("is the seven fields of the keys design joined by newlines, with no trailing newline", () => {
    const text = stringToSign({ purpose: "session", audience: "http://127.0.0.1:4780#inst_1", keyId: "fxk_abc", time: "20261109T120000Z", nonce: "n".repeat(22), payloadSha256Hex: "ab".repeat(32) });
    expect(text.split("\n")).toEqual(["FLUXIQ1-ED25519", "session", "http://127.0.0.1:4780#inst_1", "fxk_abc", "20261109T120000Z", "n".repeat(22), "ab".repeat(32)]);
    expect(text.endsWith("\n")).toBe(false);
  });

  it("refuses a field that holds a newline", () => {
    expect(() => stringToSign({ purpose: "session", audience: "a\nb", keyId: "k", time: "t", nonce: "n", payloadSha256Hex: "h" })).toThrow(/line break/u);
  });

  it("formats time as YYYYMMDDTHHMMSSZ in UTC", () => {
    expect(formatProofTime(new Date(Date.UTC(2026, 10, 9, 14, 5, 7, 999)))).toBe("20261109T140507Z");
  });
});
