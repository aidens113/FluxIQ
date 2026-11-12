import type { Guarded } from "../../security/model";
import { shapeMembersView, type MembersView } from "../model";

/**
 * The workspace's people for an administrator (`GET /api/accounts/members`).
 * A refusal (401 or 403) is `denied`, so the admin tools stay hidden; any
 * other failure throws, and the section says it could not read them.
 */
export async function loadMembers(signal: AbortSignal): Promise<Guarded<MembersView>> {
  const response = await fetch("/api/accounts/members", { cache: "no-store", credentials: "same-origin", signal });
  if (response.status === 401 || response.status === 403) return { state: "denied" };
  if (!response.ok) throw new Error(`accounts members failed (${response.status})`);
  const body = (await response.json()) as { ok?: unknown; payload?: unknown };
  if (body.ok !== true) throw new Error("accounts members failed");
  return { state: "ready", data: shapeMembersView(body.payload) };
}
