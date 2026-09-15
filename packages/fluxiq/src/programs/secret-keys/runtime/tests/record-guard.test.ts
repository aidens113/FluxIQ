import { describe, expect, it } from "vitest";
import { isSecretKeyRecord } from "../record-guard.ts";
import { SecretValueSealer } from "../value-sealer.ts";
import { WEAK_SCRYPT_PARAMETERS, legacyV1Record } from "./secret-key-fixtures.ts";

const PASSWORD = "dummy-password";

async function fixtures() {
  const sealer = new SecretValueSealer({ testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS });
  const v1 = legacyV1Record({ id: "secret:guarded", value: "guarded-value", password: PASSWORD });
  const { sealed, key } = await sealer.seal({ id: v1.id, value: "guarded-value", updatedAtMs: 1000 }, PASSWORD, "user.one");
  key.fill(0);
  return { sealer, v1, sealed, withSeal: (seal: unknown) => ({ ...v1, sealed: seal }) };
}

describe("isSecretKeyRecord", () => {
  it("accepts version 1 and version 2 records, and a version 2 pending seal", async () => {
    const { sealer, v1, sealed, withSeal } = await fixtures();
    expect(isSecretKeyRecord(v1, sealer)).toBe(true);
    expect(isSecretKeyRecord(withSeal(sealed), sealer)).toBe(true);
    expect(isSecretKeyRecord({ ...v1, pendingSealed: sealed }, sealer)).toBe(true);
  });

  it("rejects a seal whose version does not match its fields", async () => {
    const { sealer, v1, sealed, withSeal } = await fixtures();
    const withoutParameters: Record<string, unknown> = { ...sealed };
    delete withoutParameters.kdfParams;

    expect(isSecretKeyRecord(withSeal({ ...v1.sealed, kdfParams: sealed.kdfParams }), sealer)).toBe(false);
    expect(isSecretKeyRecord(withSeal({ ...v1.sealed, sealedByUserId: "user.one" }), sealer)).toBe(false);
    expect(isSecretKeyRecord(withSeal(withoutParameters), sealer)).toBe(false);
    expect(isSecretKeyRecord(withSeal({ ...sealed, version: 3 }), sealer)).toBe(false);
  });

  it("rejects parameters outside the reader's allowlist, an undecodable salt, and a malformed stamp", async () => {
    const { sealer, sealed, withSeal } = await fixtures();

    expect(isSecretKeyRecord(withSeal({ ...sealed, kdfParams: { N: 2 ** 30, r: 8, p: 1, keyLength: 32 } }), sealer)).toBe(false);
    expect(isSecretKeyRecord(withSeal(sealed), new SecretValueSealer())).toBe(false);
    expect(isSecretKeyRecord(withSeal({ ...sealed, salt: "not-a-salt" }), sealer)).toBe(false);
    expect(isSecretKeyRecord(withSeal({ ...sealed, sealedByUserId: 42 }), sealer)).toBe(false);
    expect(isSecretKeyRecord(withSeal({ ...sealed, sealedByUserId: "" }), sealer)).toBe(false);
  });

  it("rejects a pending seal that is version 1, outside the allowlist, or not a seal", async () => {
    const { sealer, v1, sealed } = await fixtures();

    expect(isSecretKeyRecord({ ...v1, pendingSealed: v1.sealed }, sealer)).toBe(false);
    expect(isSecretKeyRecord({ ...v1, pendingSealed: { ...sealed, kdfParams: { N: 2 ** 30, r: 8, p: 1, keyLength: 32 } } }, sealer)).toBe(false);
    expect(isSecretKeyRecord({ ...v1, pendingSealed: "not-a-seal" }, sealer)).toBe(false);
  });
});
