import { createHash, scryptSync, type BinaryLike } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "../hash-password.ts";
import type { ScryptParameters } from "../types.ts";
import { verifyPasswordHash } from "../verify-password-hash.ts";

const DUMMY_PASSWORD = "dummy-password-for-tests";
const WEAK: ScryptParameters = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 };

function fields(encoded: string): { saltText: string; hashText: string } {
  const [, , , saltText, hashText] = encoded.split("$");
  return { saltText: saltText ?? "", hashText: hashText ?? "" };
}

describe("hashPassword", () => {
  it("writes the current parameters as a PHC string that verifies without a rehash", async () => {
    const encoded = await hashPassword(DUMMY_PASSWORD);

    expect(encoded).toMatch(/^\$scrypt\$ln=17,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    await expect(verifyPasswordHash(DUMMY_PASSWORD, encoded)).resolves.toEqual({ ok: true, needsRehash: false });
  });

  it("writes weak test parameters with a fresh salt each time", async () => {
    const first = await hashPassword(DUMMY_PASSWORD, { testOnlyWeakParameters: WEAK });
    const second = await hashPassword(DUMMY_PASSWORD, { testOnlyWeakParameters: WEAK });

    expect(first).toMatch(/^\$scrypt\$ln=10,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    await expect(verifyPasswordHash(DUMMY_PASSWORD, first, { testOnlyWeakParameters: WEAK }))
      .resolves.toEqual({ ok: true, needsRehash: false });
  });

  it("stores base64url of the salt bytes scrypt actually derived from", async () => {
    const encoded = await hashPassword(DUMMY_PASSWORD, { testOnlyWeakParameters: WEAK });
    const { saltText, hashText } = fields(encoded);
    const saltBytes = Buffer.from(saltText, "base64url");
    const scryptOptions = { N: WEAK.N, r: WEAK.r, p: WEAK.p };

    expect(saltBytes).toHaveLength(16);
    expect(saltBytes.toString("base64url")).toBe(saltText);
    expect(hashText).toBe(scryptSync(DUMMY_PASSWORD, saltBytes, 32, scryptOptions).toString("base64url"));
    expect(hashText).not.toBe(scryptSync(DUMMY_PASSWORD, saltText, 32, scryptOptions).toString("base64url"));
  });

  it("hands an injected derive the salt bytes the stored salt field decodes to", async () => {
    const issued: Buffer[] = [];
    const derive = vi.fn(async (secret: BinaryLike, salt: BinaryLike) => {
      const key = createHash("sha256").update(secret).update(salt).digest();
      issued.push(key);
      return Buffer.from(key);
    });
    const encoded = await hashPassword(DUMMY_PASSWORD, { derive, testOnlyWeakParameters: WEAK });

    expect(derive).toHaveBeenCalledTimes(1);
    const [secret, salt, parameters, options] = derive.mock.calls[0] as unknown as [string, Buffer, ScryptParameters, unknown];
    expect(secret).toBe(DUMMY_PASSWORD);
    expect(Buffer.isBuffer(salt)).toBe(true);
    expect(salt).toHaveLength(16);
    expect(parameters).toEqual(WEAK);
    expect(options).toEqual({ testOnlyWeakParameters: WEAK });
    expect(Buffer.from(fields(encoded).saltText, "base64url").equals(salt)).toBe(true);
    expect(encoded).toBe(`$scrypt$ln=10,r=8,p=1$${salt.toString("base64url")}$${issued[0]?.toString("base64url")}`);
  });

  it("zeroes the derived key after encoding it", async () => {
    let returned: Buffer | undefined;
    const derive = vi.fn(async () => {
      returned = Buffer.alloc(32, 9);
      return returned;
    });
    await hashPassword(DUMMY_PASSWORD, { derive, testOnlyWeakParameters: WEAK });
    expect(returned?.equals(Buffer.alloc(32, 0))).toBe(true);
  });

  it("refuses invalid weak parameters without deriving", async () => {
    const derive = vi.fn(async () => Buffer.alloc(32));
    await expect(hashPassword(DUMMY_PASSWORD, { derive, testOnlyWeakParameters: { N: 2 ** 17, r: 8, p: 1, keyLength: 32 } }))
      .rejects.toThrow(RangeError);
    await expect(hashPassword(DUMMY_PASSWORD, { derive, testOnlyWeakParameters: { N: 2 ** 10, r: 4, p: 1, keyLength: 32 } }))
      .rejects.toThrow(RangeError);
    expect(derive).not.toHaveBeenCalled();
  });

  it("refuses a derived key of the wrong length", async () => {
    const derive = vi.fn(async () => Buffer.alloc(16));
    await expect(hashPassword(DUMMY_PASSWORD, { derive, testOnlyWeakParameters: WEAK })).rejects.toThrow(/wrong length/);
  });
});
