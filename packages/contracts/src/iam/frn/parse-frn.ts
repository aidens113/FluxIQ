import { isIamService } from "../service.ts";
import { FRN_MAX_LENGTH, FRN_PREFIX, FRN_SEGMENT_PATTERN, FRN_SERVICE_SHAPES, type FluxIQResourceName, type FrnServiceShape } from "./frn.ts";

/**
 * Parses a FluxIQ Resource Name, or returns null. Exact: an unknown service, a
 * workspace segment the service does not allow (or lacks), an unknown resource
 * type or child kind, an empty or ill-formed identifier, or a wildcard rejects
 * the whole name. A pattern with wildcards is a policy `Resource`, not an FRN
 * (`isIamResourcePattern`).
 */
export function parseFluxIQResourceName(value: unknown): FluxIQResourceName | null {
  if (typeof value !== "string" || value.length > FRN_MAX_LENGTH || !value.startsWith(FRN_PREFIX)) return null;
  const parts = value.slice(FRN_PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const [service, workspace, resource] = parts as [string, string, string];
  if (!isIamService(service)) return null;
  const shape = FRN_SERVICE_SHAPES[service];
  const workspaceId = workspace === "" ? null : workspace;
  if (!workspaceAllowed(shape, workspaceId)) return null;
  const segments = resource.split("/");
  const [resourceType, ...path] = segments;
  if (resourceType === undefined || !typeAllowed(shape, resourceType, workspaceId)) return null;
  if (!pathAllowed(shape, resourceType, path)) return null;
  return { service, workspaceId, resourceType, resourceId: path.join("/") };
}

function workspaceAllowed(shape: FrnServiceShape, workspaceId: string | null): boolean {
  if (workspaceId !== null && !FRN_SEGMENT_PATTERN.test(workspaceId)) return false;
  if (shape.workspace === "required") return workspaceId !== null;
  if (shape.workspace === "none") return workspaceId === null;
  return true;
}

function typeAllowed(shape: FrnServiceShape, resourceType: string, workspaceId: string | null): boolean {
  if (!shape.types.includes(resourceType)) return false;
  return workspaceId !== null || shape.platformTypes === undefined || shape.platformTypes.includes(resourceType);
}

// The path is the type's own id, then any number of `<childKind>/<childId>`
// pairs whose kinds the type allows.
function pathAllowed(shape: FrnServiceShape, resourceType: string, path: readonly string[]): boolean {
  const [id, ...pairs] = path;
  if (id === undefined || !FRN_SEGMENT_PATTERN.test(id)) return false;
  if (pairs.length % 2 !== 0) return false;
  const kinds = shape.children?.[resourceType] ?? [];
  for (let index = 0; index < pairs.length; index += 2) {
    const kind = pairs[index];
    const childId = pairs[index + 1];
    if (kind === undefined || childId === undefined) return false;
    if (!kinds.includes(kind) || !FRN_SEGMENT_PATTERN.test(childId)) return false;
  }
  return true;
}
