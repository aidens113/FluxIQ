import type { AppGrant } from "./schema.ts";

/** Structural subset only. A requested or approved row is not an authorization decision. */
export function appGrantCovers(approved: AppGrant, requested: AppGrant): boolean {
  if (approved.capability !== requested.capability) return false;
  if (approved.capability === "network.origin" || requested.capability === "network.origin") return approved.capability === "network.origin" && requested.capability === "network.origin" && approved.origin === requested.origin;
  if (approved.bindingId !== requested.bindingId) return false;
  if (approved.capability === "automation.execute" && requested.capability === "automation.execute") return requested.acts.every(act => approved.acts.includes(act));
  return true;
}
