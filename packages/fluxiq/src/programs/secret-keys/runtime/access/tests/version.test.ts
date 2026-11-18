import { describe, expect, it } from "vitest";
import { sameSecretKeyVersion } from "../index.ts";
import { legacyV1Record } from "../../tests/secret-key-fixtures.ts";

describe("semantic secret-key version", () => {
  const record = legacyV1Record({ id: "synthetic-key", value: "synthetic-value", password: "synthetic-password", createdBy: "alice" });

  it("permits only an audit-time replacement", () => {
    expect(sameSecretKeyVersion({ ...record, lastRevealedAtMs: 100 }, record)).toBe(true);
    expect(sameSecretKeyVersion({ ...record, lastRevealedAtMs: 200 }, { ...record, lastRevealedAtMs: 100 })).toBe(true);
  });

  it.each([
    { enabled: false }, { provider: "other" }, { createdBy: "bob" },
    { metadata: { model: "other" } }, { scope: "domain" as const }, { name: "changed" },
    { sealed: { ...record.sealed, ciphertext: "changed" } }
  ])("rejects a semantic edit even when updatedAtMs is unchanged: %j", (edit) => {
    expect(sameSecretKeyVersion({ ...record, ...edit }, record)).toBe(false);
  });
});
