import { expect, it } from "vitest";
import { bindTrustedModuleIdentity, readTrustedModuleIdentities } from "../index.ts";
const identity = { schema: 1 as const, protocol: "fluxiq.module-build-identity.v1" as const, moduleId: "example/runtime", version: "1.0.0", normalization: "module-payload-v1" as const, artifactDigest: "a".repeat(64), sourceInputsDigest: "b".repeat(64) };
it("captures immutable provenance and accepts identical instrumented replacements", () => {
  const owner = {}, input = { ...identity };
  bindTrustedModuleIdentity(owner, input); input.artifactDigest = "c".repeat(64);
  expect(readTrustedModuleIdentities(owner)).toEqual([identity]);
  bindTrustedModuleIdentity(owner, identity);
  expect(Object.isFrozen(readTrustedModuleIdentities(owner)[0])).toBe(true);
});
it("legacy binding clears active attestation without erasing the original anchor", () => {
  const owner = {}; bindTrustedModuleIdentity(owner, identity); bindTrustedModuleIdentity(owner);
  expect(readTrustedModuleIdentities(owner)).toEqual([]);
  expect(() => bindTrustedModuleIdentity(owner, { ...identity, artifactDigest: "c".repeat(64) })).toThrow(/changed/);
  expect(readTrustedModuleIdentities(owner)).toEqual([]);
  bindTrustedModuleIdentity(owner, identity); expect(readTrustedModuleIdentities(owner)).toEqual([identity]);
});
it("allows initial legacy use but rejects malformed identities before changing attestation", () => {
  const owner = {}; bindTrustedModuleIdentity(owner); bindTrustedModuleIdentity(owner, identity);
  for (const invalid of [{ ...identity, sourceInputsDigest: "bad" }, { ...identity, unexpected: true }, { ...identity, moduleId: "../bad" }]) {
    expect(() => bindTrustedModuleIdentity(owner, invalid as typeof identity)).toThrow(/Malformed/);
    expect(readTrustedModuleIdentities(owner)).toEqual([identity]);
  }
});
