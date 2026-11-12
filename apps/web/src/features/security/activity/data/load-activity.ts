import type { Guarded } from "../../model";
import { shapeActivityPage, type ActivityPage } from "../model";

/**
 * One page of the workspace's activity (`GET /api/security/audit`), from the
 * start or from a page's `next`. A refusal (401 or 403) is `denied`: the
 * section says the person has no access; any other failure throws, and the
 * section says it could not read it.
 */
export async function loadActivity(cursor: string | null, signal?: AbortSignal): Promise<Guarded<ActivityPage>> {
  const query = cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`;
  const response = await fetch(`/api/security/audit${query}`, { cache: "no-store", credentials: "same-origin", ...(signal === undefined ? {} : { signal }) });
  if (response.status === 401 || response.status === 403) return { state: "denied" };
  if (!response.ok) throw new Error(`activity failed (${response.status})`);
  const body = (await response.json()) as { ok?: unknown; payload?: unknown };
  if (body.ok !== true) throw new Error("activity failed");
  return { state: "ready", data: shapeActivityPage(body.payload) };
}
