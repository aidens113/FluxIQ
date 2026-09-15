import { describe, expect, it } from "vitest";
import {
  ACCEPTED_V2_SCRYPT_PARAMETERS,
  CURRENT_SCRYPT_PARAMETERS,
  LEGACY_V1_SCRYPT_PARAMETERS,
  isAcceptedScryptParameters,
  isAcceptedV2ScryptParameters,
  isBelowScryptWriteCost,
  scryptWriteParameters
} from "../scrypt-parameters.ts";
import type { ScryptParameters } from "../types.ts";

const WEAK: ScryptParameters = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 };

function at(log2N: number): ScryptParameters {
  return { N: 2 ** log2N, r: 8, p: 1, keyLength: 32 };
}

function withField(field: string, value: unknown): unknown {
  return { ...CURRENT_SCRYPT_PARAMETERS, [field]: value };
}

const OUTSIDE_ALLOWLIST: Array<[string, unknown]> = [
  ["N not a power of two", withField("N", 131_073)],
  ["N=2^30", withField("N", 2 ** 30)],
  ["N=2^16", withField("N", 2 ** 16)],
  ["N=2^19", withField("N", 2 ** 19)],
  ["N as a string", withField("N", "131072")],
  ["r=16", withField("r", 16)],
  ["p=2", withField("p", 2)],
  ["keyLength=64", withField("keyLength", 64)],
  ["an extra field", { ...CURRENT_SCRYPT_PARAMETERS, maxmem: 1 }],
  ["a missing field", { N: 2 ** 17, r: 8, p: 1 }],
  ["null", null],
  ["an array", [2 ** 17, 8, 1, 32]],
  ["N=2^10 with no weak parameters", WEAK]
];

describe("scrypt parameters", () => {
  it("writes at N=2^17, r=8, p=1 and reads legacy records at N=2^14", () => {
    expect(CURRENT_SCRYPT_PARAMETERS).toEqual({ N: 131_072, r: 8, p: 1, keyLength: 32 });
    expect(LEGACY_V1_SCRYPT_PARAMETERS).toEqual({ N: 16_384, r: 8, p: 1, keyLength: 32 });
    expect(ACCEPTED_V2_SCRYPT_PARAMETERS).toEqual([
      { N: 131_072, r: 8, p: 1, keyLength: 32 },
      { N: 262_144, r: 8, p: 1, keyLength: 32 }
    ]);
    expect(Object.isFrozen(CURRENT_SCRYPT_PARAMETERS)).toBe(true);
    expect(Object.isFrozen(LEGACY_V1_SCRYPT_PARAMETERS)).toBe(true);
    expect(Object.isFrozen(ACCEPTED_V2_SCRYPT_PARAMETERS)).toBe(true);
  });

  it("accepts exactly legacy, 2^17, and 2^18 for derivation", () => {
    expect(isAcceptedScryptParameters(LEGACY_V1_SCRYPT_PARAMETERS)).toBe(true);
    expect(isAcceptedScryptParameters(at(17))).toBe(true);
    expect(isAcceptedScryptParameters(at(18))).toBe(true);
  });

  it.each(OUTSIDE_ALLOWLIST)("rejects %s", (_label, value) => {
    expect(isAcceptedScryptParameters(value)).toBe(false);
    expect(isAcceptedV2ScryptParameters(value)).toBe(false);
  });

  it("does not accept legacy N=2^14 as a version 2 parameter set", () => {
    expect(isAcceptedV2ScryptParameters(LEGACY_V1_SCRYPT_PARAMETERS)).toBe(false);
    expect(isAcceptedV2ScryptParameters(at(17))).toBe(true);
    expect(isAcceptedV2ScryptParameters(at(18))).toBe(true);
  });

  it("widens the allowlist by exactly the valid weak parameters a test passes", () => {
    expect(isAcceptedV2ScryptParameters(WEAK, WEAK)).toBe(true);
    expect(isAcceptedScryptParameters(WEAK, WEAK)).toBe(true);
    expect(isAcceptedV2ScryptParameters({ ...WEAK, N: 2 ** 11 }, WEAK)).toBe(false);
    expect(isAcceptedScryptParameters(at(30), WEAK)).toBe(false);
  });

  it("ignores weak parameters that are not below the current cost or not r=8, p=1", () => {
    const tooStrong = at(20);
    const wrongBlockSize: ScryptParameters = { N: 2 ** 10, r: 4, p: 1, keyLength: 32 };
    const notPowerOfTwo: ScryptParameters = { N: 1000, r: 8, p: 1, keyLength: 32 };
    expect(isAcceptedV2ScryptParameters(tooStrong, tooStrong)).toBe(false);
    expect(isAcceptedV2ScryptParameters(wrongBlockSize, wrongBlockSize)).toBe(false);
    expect(isAcceptedV2ScryptParameters(notPowerOfTwo, notPowerOfTwo)).toBe(false);
  });

  it("writes at the current parameters unless valid weak parameters are given", () => {
    expect(scryptWriteParameters()).toBe(CURRENT_SCRYPT_PARAMETERS);
    expect(scryptWriteParameters(undefined)).toBe(CURRENT_SCRYPT_PARAMETERS);
    expect(scryptWriteParameters(WEAK)).toEqual(WEAK);
    expect(() => scryptWriteParameters(at(17))).toThrow(RangeError);
    expect(() => scryptWriteParameters({ N: 1000, r: 8, p: 1, keyLength: 32 })).toThrow(RangeError);
    expect(() => scryptWriteParameters({ N: 2 ** 10, r: 4, p: 1, keyLength: 32 })).toThrow(RangeError);
  });

  describe("rewrite rule", () => {
    it("does not rewrite a record at the write cost: ln=17 at a write of ln=17", () => {
      expect(isBelowScryptWriteCost(at(17), at(17))).toBe(false);
    });

    it("never downgrades a stronger record: ln=18 at a write of ln=17", () => {
      expect(isBelowScryptWriteCost(at(18), at(17))).toBe(false);
    });

    it("rewrites a record below the write cost: ln=17 at a write of ln=18", () => {
      expect(isBelowScryptWriteCost(at(17), at(18))).toBe(true);
    });

    it("compares against the weak write parameters a test instance uses", () => {
      expect(isBelowScryptWriteCost(at(17), WEAK)).toBe(false);
      expect(isBelowScryptWriteCost(WEAK, WEAK)).toBe(false);
      expect(isBelowScryptWriteCost(LEGACY_V1_SCRYPT_PARAMETERS, CURRENT_SCRYPT_PARAMETERS)).toBe(true);
    });
  });
});
