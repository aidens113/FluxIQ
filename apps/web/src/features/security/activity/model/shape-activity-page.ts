import type { ActivityEntry, ActivityPage } from "./types";

function entryOf(value: unknown): ActivityEntry | null {
  if (value === null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.at !== "number" || !Number.isFinite(row.at)) return null;
  if (typeof row.who !== "string" || typeof row.action !== "string") return null;
  if (row.outcome !== "allowed" && row.outcome !== "denied") return null;
  const resources = Array.isArray(row.resources) ? row.resources.filter((item): item is string => typeof item === "string") : [];
  return { at: row.at, who: row.who, action: row.action, outcome: row.outcome, resources };
}

/**
 * The page an answer carries, rebuilt field by field so the screen draws only
 * what it knows: a malformed entry is left out, and anything else a server
 * might add never reaches the page.
 */
export function shapeActivityPage(payload: unknown): ActivityPage {
  const body = payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const entries = Array.isArray(body.entries) ? body.entries.map(entryOf).filter((entry): entry is ActivityEntry => entry !== null) : [];
  return { entries, next: typeof body.next === "string" && body.next !== "" ? body.next : null };
}
