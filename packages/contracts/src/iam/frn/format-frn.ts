import { FRN_PREFIX, type FluxIQResourceName } from "./frn.ts";
import { parseFluxIQResourceName } from "./parse-frn.ts";

/**
 * Formats a FluxIQ Resource Name. Throws a `TypeError` for a name
 * `parseFluxIQResourceName` would refuse, so a formatted FRN always parses back
 * to the same fields.
 */
export function formatFluxIQResourceName(name: FluxIQResourceName): string {
  const text = `${FRN_PREFIX}${name.service}:${name.workspaceId ?? ""}:${name.resourceType}/${name.resourceId}`;
  const parsed = parseFluxIQResourceName(text);
  if (parsed === null || !sameName(parsed, name)) throw new TypeError(`Not a valid FluxIQ Resource Name: ${JSON.stringify(text)}`);
  return text;
}

function sameName(left: FluxIQResourceName, right: FluxIQResourceName): boolean {
  return left.service === right.service && left.workspaceId === right.workspaceId && left.resourceType === right.resourceType && left.resourceId === right.resourceId;
}
