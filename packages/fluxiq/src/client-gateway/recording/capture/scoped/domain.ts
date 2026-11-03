import type { ClientRecordingRef } from "../../internal/index.ts";

/** A wire value can refuse a route; it never supplies the route's domain. */
export function matchesCaptureDomain(captured: ClientRecordingRef, ...supplied: unknown[]): boolean {
  return supplied.every(value => value === undefined || value === captured.domainId);
}
