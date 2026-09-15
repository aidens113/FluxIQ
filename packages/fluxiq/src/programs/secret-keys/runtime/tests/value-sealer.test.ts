import { scryptSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { LEGACY_V1_SCRYPT_PARAMETERS, decodeKdfSalt, type DeriveScryptKeyFn } from "../../../_shared/password-kdf/index.ts";
import type { EncryptedSecretValueRecordV2 } from "../../types.ts";
import { SecretValueSealer, type SecretKeyValue } from "../value-sealer.ts";
import { WEAK_SCRYPT_PARAMETERS, legacySealV1 } from "./secret-key-fixtures.ts";

const PASSWORD = "dummy-password";
const payload: SecretKeyValue = { id: "secret:sealed", value: "sealed-value", updatedAtMs: 1000 };

function weakSealer(): SecretValueSealer {
  return new SecretValueSealer({ testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS });
}

describe("SecretValueSealer", () => {
  it("seals version 2 from the decoded salt bytes at the write parameters, and opens with the returned key", async () => {
    const sealer = weakSealer();
    const { sealed, key } = await sealer.seal(payload, PASSWORD, "user.one");

    expect(sealed).toMatchObject({ version: 2, algorithm: "aes-256-gcm", kdf: "scrypt", kdfParams: { N: 1024, r: 8, p: 1, keyLength: 32 }, sealedByUserId: "user.one" });
    const saltBytes = decodeKdfSalt(sealed.salt);
    expect(saltBytes?.length).toBe(16);
    expect(key.equals(scryptSync(PASSWORD, saltBytes!, 32, { N: 1024, r: 8, p: 1 }))).toBe(true);
    expect(key.equals(scryptSync(PASSWORD, sealed.salt, 32, { N: 1024, r: 8, p: 1 }))).toBe(false);
    expect(sealer.open(sealed, key)).toEqual(payload);
    expect((await sealer.deriveKey(sealed, PASSWORD)).equals(key)).toBe(true);
  });

  it("opens a version 1 seal with a key derived at the legacy parameters from the salt text", async () => {
    const sealer = weakSealer();
    const sealed = legacySealV1(payload, PASSWORD);

    expect(sealer.parametersOf(sealed)).toBe(LEGACY_V1_SCRYPT_PARAMETERS);
    expect(sealer.open(sealed, await sealer.deriveKey(sealed, PASSWORD))).toEqual(payload);
    expect(sealer.open(sealed, await sealer.deriveKey(sealed, "wrong-dummy-password"))).toBeNull();
  });

  it("refuses to derive for parameters outside the allowlist or a salt that does not decode", async () => {
    const derive = vi.fn<DeriveScryptKeyFn>();
    const sealer = new SecretValueSealer({ derive, testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS });
    const { sealed } = await weakSealer().seal(payload, PASSWORD);
    const outside: EncryptedSecretValueRecordV2 = { ...sealed, kdfParams: { N: 2 ** 30, r: 8, p: 1, keyLength: 32 } };

    expect(sealer.parametersOf(outside)).toBeNull();
    await expect(sealer.deriveKey(outside, PASSWORD)).rejects.toThrow("not accepted");
    await expect(sealer.deriveKey({ ...sealed, salt: `${sealed.salt}=` }, PASSWORD)).rejects.toThrow("salt is invalid");
    expect(derive).not.toHaveBeenCalled();
  });

  it("asks for a re-seal only for version 1 or a cost below the write parameters", async () => {
    const sealer = weakSealer();
    const { sealed } = await sealer.seal(payload, PASSWORD);

    expect(sealer.needsReseal(legacySealV1(payload, PASSWORD))).toBe(true);
    expect(sealer.needsReseal(sealed)).toBe(false);
    expect(sealer.needsReseal({ ...sealed, kdfParams: { N: 2 ** 17, r: 8, p: 1, keyLength: 32 } })).toBe(false);
    expect(sealer.needsReseal({ ...sealed, kdfParams: { N: 2 ** 9, r: 8, p: 1, keyLength: 32 } })).toBe(true);
  });

  it("rejects a truncated authentication tag and a plaintext that is not a secret key payload", async () => {
    const sealer = weakSealer();
    const { sealed, key } = await sealer.seal(payload, PASSWORD);
    const truncatedTag = Buffer.from(sealed.tag, "base64url").subarray(0, 12).toString("base64url");
    expect(sealer.open({ ...sealed, tag: truncatedTag }, key)).toBeNull();

    const notPayload = await sealer.seal({ id: 1 } as unknown as SecretKeyValue, PASSWORD);
    expect(sealer.open(notPayload.sealed, notPayload.key)).toBeNull();
  });
});
