import type { ActivityCursor } from "./types";

/** A cursor as the text a page's `next` carries: `<second>.<count>`. It names a place in the audit and nothing else. */
export function formatCursor(cursor: ActivityCursor): string {
  return `${cursor.t}.${cursor.k}`;
}
