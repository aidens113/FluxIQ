import { ENVIRONMENT_ID_PATTERN } from "../model/index.ts";
import { ENVIRONMENT_HOST_ID_PREFIX } from "./host-id-prefix.ts";

/** The environment a managed host id names, or null when it names none (a development pool host, or anything malformed). */
export function environmentOfHost(hostId: unknown): string | null {
  if (typeof hostId !== "string" || !hostId.startsWith(ENVIRONMENT_HOST_ID_PREFIX)) return null;
  const environmentId = hostId.slice(ENVIRONMENT_HOST_ID_PREFIX.length);
  return ENVIRONMENT_ID_PATTERN.test(environmentId) ? environmentId : null;
}
