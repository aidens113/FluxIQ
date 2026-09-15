import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveScryptKey } from "../derive-scrypt-key.ts";
import { CURRENT_SCRYPT_PARAMETERS, LEGACY_V1_SCRYPT_PARAMETERS } from "../scrypt-parameters.ts";
import type { ScryptParameters } from "../types.ts";

const DUMMY_SECRET = "dummy-password-for-tests";
const DUMMY_SALT = "dummy-salt-for-tests";
const WEAK: ScryptParameters = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 };

type ScryptCallback = (error: Error | null, key: Buffer) => void;

async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

function refuseScrypt() {
  return vi.spyOn(crypto, "scrypt").mockImplementation((() => {
    throw new Error("crypto.scrypt must not be called");
  }) as never);
}

function outside(field: keyof ScryptParameters, value: number): ScryptParameters {
  return { ...CURRENT_SCRYPT_PARAMETERS, [field]: value } as unknown as ScryptParameters;
}

describe("deriveScryptKey", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("derives 32 bytes at N=2^17 with maxmem 256·N·r", async () => {
    const spy = vi.spyOn(crypto, "scrypt");
    const key = await deriveScryptKey(DUMMY_SECRET, DUMMY_SALT, CURRENT_SCRYPT_PARAMETERS);

    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key).toHaveLength(32);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      DUMMY_SECRET,
      DUMMY_SALT,
      32,
      { N: 131_072, r: 8, p: 1, maxmem: 268_435_456 },
      expect.any(Function)
    );
  });

  it("matches the legacy scryptSync(value, salt, 32) derivation at the v1 parameters", async () => {
    const key = await deriveScryptKey(DUMMY_SECRET, DUMMY_SALT, LEGACY_V1_SCRYPT_PARAMETERS);
    expect(key.equals(crypto.scryptSync(DUMMY_SECRET, DUMMY_SALT, 32))).toBe(true);
  });

  it.each<[string, ScryptParameters]>([
    ["N not a power of two", outside("N", 131_073)],
    ["N=2^30", outside("N", 2 ** 30)],
    ["N=2^16", outside("N", 2 ** 16)],
    ["r=16", outside("r", 16)],
    ["p=2", outside("p", 2)],
    ["keyLength=64", outside("keyLength", 64)],
    ["weak N=2^10 without testOnlyWeakParameters", WEAK]
  ])("rejects %s before crypto.scrypt is called", async (_label, parameters) => {
    const spy = refuseScrypt();
    const pending = deriveScryptKey(DUMMY_SECRET, DUMMY_SALT, parameters);

    await expect(pending).rejects.toThrow(/outside the accepted set/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("accepts weak parameters only for the caller that passes them", async () => {
    const key = await deriveScryptKey(DUMMY_SECRET, DUMMY_SALT, WEAK, { testOnlyWeakParameters: WEAK });
    expect(key).toHaveLength(32);

    const spy = refuseScrypt();
    await expect(deriveScryptKey(DUMMY_SECRET, DUMMY_SALT, { ...WEAK, N: 2 ** 11 }, { testOnlyWeakParameters: WEAK }))
      .rejects.toThrow(/outside the accepted set/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("runs derivations through the process-wide limit of two", async () => {
    const callbacks: ScryptCallback[] = [];
    vi.spyOn(crypto, "scrypt").mockImplementation(((
      _secret: unknown,
      _salt: unknown,
      _keyLength: unknown,
      _options: unknown,
      callback: ScryptCallback
    ) => {
      callbacks.push(callback);
    }) as never);

    const pending = [0, 1, 2].map(() => deriveScryptKey(DUMMY_SECRET, DUMMY_SALT, WEAK, { testOnlyWeakParameters: WEAK }));
    const settled = Promise.allSettled(pending);

    await flushMicrotasks();
    expect(callbacks).toHaveLength(2);

    callbacks[0]?.(null, Buffer.alloc(32, 1));
    await flushMicrotasks();
    expect(callbacks).toHaveLength(3);

    callbacks[1]?.(new Error("dummy scrypt failure"), Buffer.alloc(0));
    callbacks[2]?.(null, Buffer.alloc(32, 3));
    const [first, second, third] = await settled;

    expect(first).toEqual({ status: "fulfilled", value: Buffer.alloc(32, 1) });
    expect(second?.status).toBe("rejected");
    expect(third).toEqual({ status: "fulfilled", value: Buffer.alloc(32, 3) });
  });
});
