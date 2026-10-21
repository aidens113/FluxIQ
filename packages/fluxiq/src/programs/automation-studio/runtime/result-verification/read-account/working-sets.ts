// The record sets that hold working rows, never the answer (t752): the one
// rule every check of a summary's rows reads them by.
//
// **Why.** A Flow read a list with no condition, repeated a display-only press
// over the rows it kept, then read the same list again with a condition and
// stored the few rows the request asked for. Every read collects its rows into
// a record set, so the first read's whole list was stored beside the answer,
// and every check here took every record set for the result: each row the last
// read's condition left out was "stored though left out" by the first read
// (`../request-rows/summary-with-also-in-result.ts`), the judge was told each
// was a row of the result the answer should not hold, and a yes that did not
// name each one was held (`../request-rows/unquoted-rows.ts`). The exactly
// right answer could not be judged yes.
//
// Beside the flag it reads, and imported by `../request-rows/` as a leaf, never
// through this directory's barrel (`../request-rows/summary-reads.ts` says
// why): it imports nothing but the contract's types.
//
// **The rule, from what Core records.** A record set is working rows when every
// read its processing passes name as collectors (`processing.passes[].node`)
// carries Core's flag `workingRows` (`./working-rows.ts`: a loop
// walked that read's rows, and a later read of the same target read the list
// again), and the later read each flag names collected a record set that is
// not working rows itself, directly or through a later flagged read of its
// own: the answer exists. Nothing is read from a name, a label or a step's
// words. A set that names no collector, or one a flagged read shares with any
// other read, could hold the answer, so it is never working rows: what Core
// cannot tell apart it does not set aside.
//
// **What it changes.** A working set's rows are never the result
// (`../request-rows/summary-reads.ts`: not stored, not `inResult`), never the
// holder of a row another read left out (`automationStudioRequestRowsStoredBy`,
// so never `storedThoughLeftOut`), and never a kept row Core flags
// (`../request-rows/kept-without-asked-column.ts`,
// `../request-rows/unquoted-rows.ts`). A row the later read's condition left
// out that only a working set holds is a left-out row like any other, held to
// the request's words as such (t515), never a copy kept.
//
// **t691 still holds.** Where the earlier read's condition narrowed what the
// Flow acted on and the later read stored rows it left out, the earlier read's
// set is working rows, but the holder of those rows is the later read's set,
// the answer: they are still stored though left out.

import type { AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts/index.ts";

/** The dataset ids of the summary's record sets that hold working rows (header); empty when none does. */
export function automationStudioResultReadWorkingSets(summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">): ReadonlySet<string> {
  const rereadBy = new Map((summary.reads ?? []).flatMap((read) => read.workingRows ? [[read.nodeId, read.workingRows.rereadBy] as const] : []));
  if (!rereadBy.size) return new Set();
  const collectors = (set: AutomationStudioResultRecordSetSummary): string[] => [...new Set((set.processing?.passes ?? []).map((pass) => pass.node))];
  const candidates = summary.recordSets.filter((set) => {
    const nodes = collectors(set);
    return nodes.length > 0 && nodes.every((node) => rereadBy.has(node));
  });
  const candidateIds = new Set(candidates.map((set) => set.datasetId));
  // The reads that collected a set that could hold the answer.
  const answering = new Set(summary.recordSets.filter((set) => !candidateIds.has(set.datasetId)).flatMap(collectors));
  const reachesAnswer = (node: string, seen: ReadonlySet<string>): boolean => {
    const later = rereadBy.get(node);
    if (later === undefined || seen.has(later)) return false;
    return answering.has(later) || reachesAnswer(later, new Set([...seen, later]));
  };
  return new Set(candidates.filter((set) => collectors(set).every((node) => reachesAnswer(node, new Set([node])))).map((set) => set.datasetId));
}
