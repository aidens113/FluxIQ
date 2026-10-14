// A runtime session listing's cursor: the position of the last summary a page
// returned, in the listing's order (newest queued first, then run id). Opaque
// to a caller, which hands back exactly what `nextCursor` gave it. A queued
// time never changes once a session exists, so a cursor stays valid while
// sessions start, end and are added above it.
//
// Written as `<queuedAt>:<runId>` in base64url, so reading one back parses no
// JSON and needs no failure of its own to be told apart from a bad cursor.

export type AutomationStudioRuntimeSessionCursor = { queuedAt: number; runId: string };

export function encodeAutomationStudioRuntimeSessionCursor(position: AutomationStudioRuntimeSessionCursor): string {
  return Buffer.from(`${position.queuedAt}:${position.runId}`, "utf8").toString("base64url");
}

/** The position a cursor names, or `null` when the value is not one this listing could have written. */
export function decodeAutomationStudioRuntimeSessionCursor(value: string): AutomationStudioRuntimeSessionCursor | null {
  if (value.length === 0 || value.length > 600 || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const text = Buffer.from(value, "base64url").toString("utf8");
  const separator = text.indexOf(":");
  const queuedAt = separator > 0 ? text.slice(0, separator) : "";
  const runId = separator > 0 ? text.slice(separator + 1) : "";
  if (!/^-?\d{1,16}(\.\d{1,6})?$/u.test(queuedAt) || runId.length === 0) return null;
  return { queuedAt: Number(queuedAt), runId };
}
