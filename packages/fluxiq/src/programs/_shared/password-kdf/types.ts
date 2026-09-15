import type { BinaryLike } from "node:crypto";

/** scrypt cost parameters, recorded beside every password-derived key or hash. */
export type ScryptParameters = {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keyLength: 32;
};

/**
 * Per-derivation options. `testOnlyWeakParameters` widens the read allowlist
 * by exactly that one parameter set, for the instance that passes it; nothing
 * in production passes it.
 */
export type ScryptDerivationOptions = {
  readonly testOnlyWeakParameters?: ScryptParameters | undefined;
};

export type DeriveScryptKeyFn = (
  secret: BinaryLike,
  salt: BinaryLike,
  parameters: ScryptParameters,
  options?: ScryptDerivationOptions
) => Promise<Buffer>;

/**
 * Test-only injection a service accepts. `derive` lets a test count
 * derivations; `testOnlyWeakParameters` (for example N=2^10) is the only way to
 * write below the current parameters. `createGlobalProgramRuntime` passes
 * neither.
 */
export type PasswordKdfOptions = {
  readonly derive?: DeriveScryptKeyFn | undefined;
  readonly testOnlyWeakParameters?: ScryptParameters | undefined;
};
