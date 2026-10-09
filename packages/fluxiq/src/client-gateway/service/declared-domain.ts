import type { JsonObject } from "../../core/index.ts";

/**
 * The domain a client declared in `client.hello` (`metadata.domainId`), or
 * null when it declared none. Pairing binds this value into the trust record,
 * and a later connection must declare the same one to be resumed.
 */
export function declaredDomainId(metadata: JsonObject | undefined): string | null {
  const declared = metadata?.domainId;
  return typeof declared === "string" && declared.trim() ? declared.trim() : null;
}
