import type { ActivityCursor } from "./types";

const CURSOR = /^(\d{1,12})\.([1-9]\d{0,8})$/u;

/** The cursor a page's `next` was (`formatCursor`), or null for anything else. */
export function parseCursor(text: string): ActivityCursor | null {
  const match = CURSOR.exec(text);
  if (match === null) return null;
  return { t: Number(match[1]), k: Number(match[2]) };
}
