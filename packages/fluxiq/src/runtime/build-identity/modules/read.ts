import { trustedModuleBindings } from "./registry.ts";
import type { TrustedModuleBuildIdentity } from "./types.ts";
/** Returns only provenance of the currently bound runtime, never its historical anchor. */
export function readTrustedModuleIdentities(owner: object): readonly TrustedModuleBuildIdentity[] {
  const active = trustedModuleBindings.get(owner)?.active;
  return Object.freeze(active ? [active] : []);
}
