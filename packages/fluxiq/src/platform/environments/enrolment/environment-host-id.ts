import { ENVIRONMENT_ID_PATTERN } from "../model/index.ts";
import { ENVIRONMENT_HOST_ID_PREFIX } from "./host-id-prefix.ts";

/**
 * The managed host id an environment's client enrols under. Its trust keeps
 * it, so the binding a credential proves names its environment, and its
 * service identity stays the narrow `managed-host:<host id>`.
 */
export function environmentHostId(environmentId: string): string {
  if (typeof environmentId !== "string" || !ENVIRONMENT_ID_PATTERN.test(environmentId)) throw new TypeError("Invalid environment id");
  return `${ENVIRONMENT_HOST_ID_PREFIX}${environmentId}`;
}
