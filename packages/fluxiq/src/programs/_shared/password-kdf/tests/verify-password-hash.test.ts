import crypto, { createHash, type BinaryLike } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScryptParameters } from "../types.ts";
import { verifyPasswordHash } from "../verify-password-hash.ts";

const DUMMY_PASSWORD = "dummy-password-for-tests";
const WRONG_DUMMY_PASSWORD = "wrong-dummy-password-for-tests";
const WEAK: ScryptParameters = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 };
const LEGACY: ScryptParameters = { N: 2 ** 14, r: 8, p: 1, keyLength: 32 };
const SALT = "ZHVtbXktc2FsdC0xNmJ5dA";
const SALT_BYTES = Buffer.from(SALT, "base64url");
const REJECTED = { ok: false, needsRehash: false };

/**
 * A stand-in derivation with no scrypt cost. It tells a salt passed as text
 * from the same salt passed as bytes, and returns a fresh buffer each call.
 */
function fakeDerive() {
  return vi.fn(async (secret: BinaryLike, salt: BinaryLike, parameters: ScryptParameters) => createHash("sha256")
    .update(secret)
    .update(typeof salt === "string" ? `|text:${salt}` : `|bytes:${Buffer.from(salt as Uint8Array).toString("hex")}`)
    .update(`|${parameters.N}|${parameters.r}|${parameters.p}|${parameters.keyLength}`)
    .digest());
}

async function phc(ln: number, r: number, p: number): Promise<string> {
  const key = await fakeDerive()(DUMMY_PASSWORD, SALT_BYTES, { N: 2 ** ln, r, p, keyLength: 32 });
  return `$scrypt$ln=${ln},r=${r},p=${p}$${SALT}$${key.toString("base64url")}`;
}

async function fakeLegacy(): Promise<string> {
  const key = await fakeDerive()(DUMMY_PASSWORD, SALT, LEGACY);
  return `scrypt:${SALT}:${key.toString("base64url")}`;
}

function legacyHash(password: string): string {
  // Exactly what Identity Access's hashSecret wrote before version 2.
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 32).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

describe("verifyPasswordHash", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a real legacy scrypt:<salt>:<hash> from its salt text and asks for a rehash", async () => {
    const encoded = legacyHash(DUMMY_PASSWORD);

    await expect(verifyPasswordHash(DUMMY_PASSWORD, encoded)).resolves.toEqual({ ok: true, needsRehash: true });
    await expect(verifyPasswordHash(WRONG_DUMMY_PASSWORD, encoded)).resolves.toEqual(REJECTED);
    await expect(verifyPasswordHash(DUMMY_PASSWORD, encoded, { testOnlyWeakParameters: WEAK }))
      .resolves.toEqual({ ok: true, needsRehash: true });
  });

  it("verifies a real PHC hash from its decoded salt bytes, not from the salt text", async () => {
    const saltBytes = crypto.randomBytes(16);
    const saltText = saltBytes.toString("base64url");
    const scryptOptions = { N: WEAK.N, r: WEAK.r, p: WEAK.p };
    const fromBytes = crypto.scryptSync(DUMMY_PASSWORD, saltBytes, 32, scryptOptions).toString("base64url");
    const fromText = crypto.scryptSync(DUMMY_PASSWORD, saltText, 32, scryptOptions).toString("base64url");
    const options = { testOnlyWeakParameters: WEAK };

    await expect(verifyPasswordHash(DUMMY_PASSWORD, `$scrypt$ln=10,r=8,p=1$${saltText}$${fromBytes}`, options))
      .resolves.toEqual({ ok: true, needsRehash: false });
    await expect(verifyPasswordHash(WRONG_DUMMY_PASSWORD, `$scrypt$ln=10,r=8,p=1$${saltText}$${fromBytes}`, options))
      .resolves.toEqual(REJECTED);
    await expect(verifyPasswordHash(DUMMY_PASSWORD, `$scrypt$ln=10,r=8,p=1$${saltText}$${fromText}`, options))
      .resolves.toEqual(REJECTED);
  });

  describe("rehash rule", () => {
    it("legacy form: needsRehash is true", async () => {
      const derive = fakeDerive();
      await expect(verifyPasswordHash(DUMMY_PASSWORD, await fakeLegacy(), { derive }))
        .resolves.toEqual({ ok: true, needsRehash: true });
      expect(derive).toHaveBeenCalledWith(DUMMY_PASSWORD, SALT, LEGACY, { testOnlyWeakParameters: undefined });
    });

    it("ln=17 at the current write of ln=17: needsRehash is false", async () => {
      const derive = fakeDerive();
      await expect(verifyPasswordHash(DUMMY_PASSWORD, await phc(17, 8, 1), { derive }))
        .resolves.toEqual({ ok: true, needsRehash: false });
      expect(derive).toHaveBeenCalledWith(DUMMY_PASSWORD, SALT_BYTES, { N: 2 ** 17, r: 8, p: 1, keyLength: 32 }, { testOnlyWeakParameters: undefined });
    });

    it("ln=18 at the current write of ln=17: needsRehash is false, so a rollback never downgrades", async () => {
      const derive = fakeDerive();
      await expect(verifyPasswordHash(DUMMY_PASSWORD, await phc(18, 8, 1), { derive }))
        .resolves.toEqual({ ok: true, needsRehash: false });
      expect(derive).toHaveBeenCalledWith(DUMMY_PASSWORD, SALT_BYTES, { N: 2 ** 18, r: 8, p: 1, keyLength: 32 }, { testOnlyWeakParameters: undefined });
    });

    it("ln=17 read by an instance writing weak ln=10: needsRehash is false", async () => {
      await expect(verifyPasswordHash(DUMMY_PASSWORD, await phc(17, 8, 1), { derive: fakeDerive(), testOnlyWeakParameters: WEAK }))
        .resolves.toEqual({ ok: true, needsRehash: false });
    });

    // ln=17 at a write of ln=18 (needsRehash true) cannot be configured through
    // verifyPasswordHash, whose write cost is never above the current ln=17;
    // scrypt-parameters.test.ts covers it through isBelowScryptWriteCost.
  });

  it.each<[string, number, number, number]>([
    ["ln=30", 30, 8, 1],
    ["ln=14 in PHC form", 14, 8, 1],
    ["ln=16", 16, 8, 1],
    ["ln=19", 19, 8, 1],
    ["r=16", 17, 16, 1],
    ["p=2", 17, 8, 2],
    ["ln=10 without weak parameters", 10, 8, 1]
  ])("returns ok: false for out-of-allowlist %s without deriving", async (_label, ln, r, p) => {
    const encoded = await phc(ln, r, p);
    const derive = fakeDerive();
    await expect(verifyPasswordHash(DUMMY_PASSWORD, encoded, { derive })).resolves.toEqual(REJECTED);
    expect(derive).not.toHaveBeenCalled();

    const scrypt = vi.spyOn(crypto, "scrypt").mockImplementation((() => {
      throw new Error("crypto.scrypt must not be called");
    }) as never);
    await expect(verifyPasswordHash(DUMMY_PASSWORD, encoded)).resolves.toEqual(REJECTED);
    expect(scrypt).not.toHaveBeenCalled();
  });

  it.each<[string, unknown]>([
    ["undefined", undefined],
    ["empty", ""],
    ["a number", 42],
    ["legacy with empty fields", "scrypt::"],
    ["legacy with a short key", `scrypt:${SALT}:c2hvcnQ`],
    ["a padded PHC string", `$scrypt$ln=17,r=8,p=1$${SALT}$${Buffer.alloc(32).toString("base64")}`],
    ["a truncated PHC string", "$scrypt$ln=17,r=8,p=1$"],
    ["another algorithm", `$argon2id$v=19$m=65536,t=3,p=4$${SALT}$${Buffer.alloc(32).toString("base64url")}`]
  ])("returns ok: false for %s without throwing or deriving", async (_label, encoded) => {
    const derive = fakeDerive();
    await expect(verifyPasswordHash(DUMMY_PASSWORD, encoded as string | undefined, { derive })).resolves.toEqual(REJECTED);
    expect(derive).not.toHaveBeenCalled();
  });

  it("returns ok: false instead of throwing when the derivation fails", async () => {
    const encoded = await phc(17, 8, 1);
    const rejecting = vi.fn(async (): Promise<Buffer> => {
      throw new Error("dummy derivation failure");
    });
    const throwing = vi.fn((): Promise<Buffer> => {
      throw new Error("dummy synchronous failure");
    });

    await expect(verifyPasswordHash(DUMMY_PASSWORD, encoded, { derive: rejecting })).resolves.toEqual(REJECTED);
    await expect(verifyPasswordHash(DUMMY_PASSWORD, encoded, { derive: throwing })).resolves.toEqual(REJECTED);
    await expect(verifyPasswordHash(undefined as unknown as string, encoded, { derive: fakeDerive() })).resolves.toEqual(REJECTED);
  });

  it("returns ok: false for invalid weak parameters without deriving", async () => {
    const derive = fakeDerive();
    const invalidWeak: ScryptParameters = { N: 2 ** 17, r: 8, p: 1, keyLength: 32 };
    await expect(verifyPasswordHash(DUMMY_PASSWORD, await phc(17, 8, 1), { derive, testOnlyWeakParameters: invalidWeak }))
      .resolves.toEqual(REJECTED);
    expect(derive).not.toHaveBeenCalled();
  });
});
