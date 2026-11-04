// The list's order: what needs the person first, then by day, newest first.

import { dayHeading } from "./day-heading.ts";
import type { TaskRow } from "./row.ts";

export type TaskGroup = { heading: string; rows: TaskRow[] };

export const NEEDS_YOU_HEADING = "Needs you";

/** `rows` under their headings. */
export function groupTasks(rows: readonly TaskRow[], nowMs: number): TaskGroup[] {
  const newestFirst = [...rows].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  const groups: TaskGroup[] = [];
  const needs = newestFirst.filter((row) => row.state.needsPerson);
  if (needs.length > 0) groups.push({ heading: NEEDS_YOU_HEADING, rows: needs });
  for (const row of newestFirst.filter((candidate) => !candidate.state.needsPerson)) {
    const heading = dayHeading(row.updatedAtMs, nowMs);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.heading === heading) last.rows.push(row);
    else groups.push({ heading, rows: [row] });
  }
  return groups;
}
