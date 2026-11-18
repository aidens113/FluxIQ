import { sameWorkspaceRouteBinding } from "./binding";
import type { WorkspaceRouteCaller } from "./types";

/** An authority change during an IAM await requires a new decision, never a stale allow. */
export function sameWorkspaceRouteAuthority(first: WorkspaceRouteCaller, next: WorkspaceRouteCaller): boolean {
  return sameWorkspaceRouteBinding(first.binding, next.binding)
    && first.actor.roleId === next.actor.roleId
    && JSON.stringify([...new Set(first.actor.permissions)].sort()) === JSON.stringify([...new Set(next.actor.permissions)].sort());
}
