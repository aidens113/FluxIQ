"use client";

import { useCallback } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { useResource } from "../../home/data";
import { loadAccess } from "../../security/data";

/**
 * Whether the workspace has more than one person, so key sharing ("Offer to the workspace") is worth showing.
 * Read-only, from the same people list Security shows. While it is unread, or when this person may not read it,
 * the answer is false: a solo workspace never meets the idea of sharing a key.
 */
export function useWorkspaceHasOthers(): boolean {
  const identity = useProgramTransport("identity-access");
  const access = useResource(useCallback((signal: AbortSignal) => loadAccess(identity, signal), [identity]));
  if (access.state !== "ready" || access.data.state !== "ready") return false;
  return access.data.data.people.filter((person) => person.enabled).length > 1;
}
