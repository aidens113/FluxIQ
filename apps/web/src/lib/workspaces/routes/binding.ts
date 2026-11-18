import type { WorkspaceRouteBinding } from "./types";

/** Role permissions may refresh between decisions; the authenticated target may not. */
export function sameWorkspaceRouteBinding(first: WorkspaceRouteBinding, next: WorkspaceRouteBinding): boolean {
  return JSON.stringify(first) === JSON.stringify(next);
}
