import { trustedModuleBindings } from "./registry.ts";
import { screenTrustedModuleIdentity } from "./screen.ts";
import type { TrustedModuleBuildIdentity } from "./types.ts";
/** Must run before assigning a replacement runtime or registering its host IO. */
export function bindTrustedModuleIdentity(owner: object, supplied?: TrustedModuleBuildIdentity | null): void {
  const previous = trustedModuleBindings.get(owner);
  if (supplied == null) { if (previous) previous.active = null; return; }
  const identity = screenTrustedModuleIdentity(supplied);
  if (previous && JSON.stringify(previous.anchor) !== JSON.stringify(identity)) throw new Error("Trusted module build identity changed on a retained runtime owner.");
  trustedModuleBindings.set(owner, { anchor: previous?.anchor ?? identity, active: identity });
}
