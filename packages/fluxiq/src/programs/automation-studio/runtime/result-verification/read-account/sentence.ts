// A read's account as Core says it, in two lengths.
//
// `brief` is for the run's observation, which becomes the failure record's
// `actual` and is held to that record's 1,024 characters beside the check's own
// reading, so it carries the counts and names no condition. `full` is for the
// re-author's brief, which has room, and says each condition with the rows it
// rejected -- the fact a re-author needs to correct the one that dropped rows
// the request wanted, instead of adding a step that already exists.

import type { AutomationStudioResultReadAccount } from "../contracts.ts";

/** Core's sentence for how one read went. */
export function automationStudioResultReadSentence(read: AutomationStudioResultReadAccount, length: "brief" | "full"): string {
  const pages = `${read.pagesRead} ${read.pagesRead === 1 ? "page" : "pages"}${read.pageLimit !== undefined ? ` of at most ${read.pageLimit}` : ""}`;
  const stopped = read.stop ? `, paging stopped on ${read.stop}` : "";
  const cut = read.truncated ? ", cut short by a limit" : "";
  const seen = read.itemsSeen !== undefined ? ` of ${read.itemsSeen} items seen` : "";
  const attempts = read.attempts ? ` (the last of ${read.attempts} reads of this step)` : "";
  const head = `step ${read.nodeId} read ${pages}${stopped}${cut} and kept ${read.kept}${seen}${attempts}`;
  return length === "brief" ? `${head}${briefTail(read)}` : `${capitalized(head)}.${fullTail(read)}`;
}

function briefTail(read: AutomationStudioResultReadAccount): string {
  const parts: string[] = [];
  if (read.paginates === true) parts.push("it pages");
  if (read.dedupes === true) parts.push(read.dedupeBy?.length ? `keeps one row per ${read.dedupeBy.join(" + ")}` : "dedupes");
  const counts = (read.conditions ?? []).map((condition) => condition.rejected);
  if (counts.length) {
    parts.push(`its ${counts.length} ${counts.length === 1 ? "condition" : "conditions"} rejected ${counts.map((rows) => rows ?? "?").join(", ")} rows`);
  }
  if (read.unfiltered) parts.push("every row failed them, so it answered unfiltered");
  return parts.length ? `; ${parts.join(", ")}` : "";
}

function fullTail(read: AutomationStudioResultReadAccount): string {
  const lines: string[] = [];
  if (read.paginates === true) lines.push("It already follows pages; do not add a paging step around it -- change its own paging setting if more pages are needed.");
  if (read.paginates === false) lines.push("It does not follow pages.");
  if (read.dedupes === true) lines.push(`It already keeps one row per ${read.dedupeBy?.length ? read.dedupeBy.join(" + ") : "row identity"}.`);
  if (read.dedupes === false) lines.push("It does not deduplicate.");
  const conditions = read.conditions ?? [];
  if (conditions.length) {
    const said = conditions.map((condition, index) => `${condition.condition ?? `condition ${index + 1} (wording withheld)`} rejected ${condition.rejected ?? "an unreported number of"} rows`);
    lines.push(`Its conditions, each with the rows it rejected across the whole read (a row can fail more than one): ${said.join("; ")}.`);
  }
  if (read.unfiltered) lines.push("Every row failed its conditions, so it answered with the unfiltered rows.");
  return lines.length ? ` ${lines.join(" ")}` : "";
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
