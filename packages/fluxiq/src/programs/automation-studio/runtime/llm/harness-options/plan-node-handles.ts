// A plan node that names an opaque handle instead of a real parameter.
//
// The model explores through a domain's tools and sees what it found only as
// opaque handles: a domain names each thing it observed with a token, and keeps
// what the token points at to itself. That is the whole point -- a locator, a
// path or a query never reaches the model, so the model can never author one.
// But a node the model creates has to run, and running needs the real
// parameter, not a token. Until now the model's only way to fill such a
// parameter was to invent the locator it was never shown, and live runs failed
// on exactly that: a guessed field name that was not the field's name.
//
// So a plan node may name a handle where a real value belongs, as a value of
// its own: `{ "handle": "<token copied from the evidence>" }`, optionally with
// the `location` the evidence reported it at -- a handle seen while exploring
// several places is only unambiguous with the place it came from. Core finds
// every such reference; the
// bound domain rewrites the node into the parameters it really runs with, or
// refuses it. Core never reads what a handle means. It only makes sure that
// none survives resolution, so a node that names a handle either leaves with
// real parameters or does not leave at all.
//
// The shape is reserved. An object whose keys are `handle` and, optionally,
// `location` is a reference, never a literal, in any node's parameters. One
// whose token is outside the handle syntax (letters, digits and `_.:-`, at most
// 64 characters; the target-override handle's), or whose location is not a
// bounded string, is refused as malformed rather than passed on, and a node may
// name at most 16. An object with `handle` beside any other key is not a
// reference -- it is whatever the node's own validation makes of it. What a
// location means is the domain's; Core only bounds it.

import type { JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH,
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN,
  AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES
} from "../harness.ts";

/** The key of a handle reference. */
export const AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY = "handle";
/** The one other key a handle reference may carry: where the handle was seen. */
export const AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY = "location";
const MAX_LOCATION_LENGTH = 2_048;

/** Where a handle is named inside a node's parameters, and which one. */
export type AutomationStudioPlanNodeHandleSite = {
  /** Keys and array indexes from the parameters object down to the reference. */
  path: Array<string | number>;
  handle: string;
  location?: string;
};

/**
 * How deep a parameter value is searched. The plan parser already bounds JSON
 * depth well below this; a value deeper than it is refused rather than
 * searched partially.
 */
const MAX_SEARCH_DEPTH = 64;

/**
 * Every handle reference in a parameter value, or `malformed` when a reserved
 * reference shape is not a usable one: a token that is not a string or not a
 * handle, more references than a node may name, or a value too deep to search.
 */
export function automationStudioPlanNodeHandleSites(value: JsonValue | undefined): { sites: AutomationStudioPlanNodeHandleSite[]; malformed: boolean } {
  const sites: AutomationStudioPlanNodeHandleSite[] = [];
  const handleToken = new RegExp(AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN, "u");
  let malformed = false;
  const visit = (item: JsonValue, path: Array<string | number>): void => {
    if (malformed || item === null || typeof item !== "object") return;
    if (path.length > MAX_SEARCH_DEPTH) {
      malformed = true;
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, [...path, index]));
      return;
    }
    const keys = Object.keys(item);
    if (isReferenceShape(keys)) {
      const handle = item[AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY];
      const location = item[AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY];
      if (typeof handle !== "string" || handle.length > AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH || !handleToken.test(handle)
        || (location !== undefined && !isBoundedLocation(location))) {
        malformed = true;
        return;
      }
      sites.push({ path: [...path], handle, ...(typeof location === "string" ? { location } : {}) });
      if (sites.length > AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES) malformed = true;
      return;
    }
    for (const key of keys) visit(item[key] as JsonValue, [...path, key]);
  };
  if (value !== undefined) visit(value, []);
  return { sites, malformed };
}

function isReferenceShape(keys: string[]): boolean {
  return keys.includes(AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY)
    && keys.every((key) => key === AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY || key === AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY);
}

function isBoundedLocation(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_LOCATION_LENGTH && !/[\u0000-\u001f\u007f]/u.test(value);
}

/** Whether a parameter value still names a handle anywhere, well-formed or not. */
export function automationStudioPlanNodeParametersNameHandle(value: JsonValue | undefined): boolean {
  const found = automationStudioPlanNodeHandleSites(value);
  return found.malformed || found.sites.length > 0;
}
