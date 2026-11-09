// A FluxNode's name: dotted lowercase words, such as `market.cheapest-listings`. The
// name maps to the Flow path its learned Flow is filed at: under the top-level
// `nodes` folder, dots becoming folders (plan, O2), so `market.cheapest-listings` is
// `nodes/market/cheapest-listings`. The `nodes` root keeps Flows declared in code apart
// from the ones FluxIQ files itself by runtime (`web/...`), so a name like `web.x` never
// lands among them.

import { z } from "zod";
import { FLOW_PATH_LIMITS } from "./path.ts";

const NAME = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?)*$/u;

/** The top-level folder every FluxNode's Flow is filed under. */
export const FLUXNODE_FLOW_ROOT = "nodes";

/** At most 128 characters, and one dotted part fewer than a Flow path has segments (the `nodes` root takes one). */
export const FLUXNODE_NAME_MAX_LENGTH = 128;

/**
 * True when `value` is a FluxNode name: 1 to 7 parts joined by ".", each part
 * lowercase a-z, 0-9, "_" and "-", starting and ending with a letter or digit, and
 * at most 64 characters, 128 in all. Lowercase only, so two names never differ by
 * case alone, and every name is a valid Flow path.
 */
export function isFluxNodeName(value: unknown): value is string {
  if (typeof value !== "string" || value.length > FLUXNODE_NAME_MAX_LENGTH || !NAME.test(value)) return false;
  const parts = value.split(".");
  return parts.length < FLOW_PATH_LIMITS.maxSegments && parts.every((part) => part.length <= FLOW_PATH_LIMITS.maxSegmentLength);
}

/** A FluxNode name as a zod schema. */
export const fluxNodeNameSchema = z
  .string()
  .refine(isFluxNodeName, 'A FluxNode name is 1 to 7 dotted parts of lowercase a-z, 0-9, "_" and "-", such as "market.cheapest-listings".');

/** The Flow path a FluxNode's learned Flow is filed at: `nodes/` then its name with each "." a "/". */
export function fluxNodeNameToFlowPath(name: string): string {
  if (!isFluxNodeName(name)) throw new TypeError(`Not a FluxNode name: ${JSON.stringify(name)}.`);
  return `${FLUXNODE_FLOW_ROOT}/${name.replaceAll(".", "/")}`;
}
