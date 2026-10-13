// The rows each row-bound step acted on in the run being judged (t475).
//
// **Why.** Lane D round 10 (`run-mv5tusge-1400ddf7`), trial 1: the check said
// the Confirm step "pressed Confirm on all 8 rows", though its own reading of
// the end page said four rows still showed Confirm. The step runs once per kept
// row of its For Each, and its authored parameters carried the row it was
// written on -- the first row of the listing, one the condition left out --
// with nothing saying which rows it acted on. So the judge read the step as
// acting on that row, and on every row. A wrong "no" sent the build round two
// more revisions.
//
// **What is carried.** For each step that is a member of a list loop
// (`builtin.control.for-each`), the row of every pass on which the step's
// attempt succeeded and was neither skipped nor held by the page already
// showing its state: the pass's own row, as the loop handed it to the pass,
// by its own fields (a field minted per read -- `$`-prefixed, a handle, an
// evidence reference -- left out, as the run's act identity leaves it out,
// `../executor/lifecycle-run/act-identity.ts`). Screened as a stored row is:
// nothing without a declaration of the domain's denied keys, and a row
// holding a denied key or a credential-shaped value is replaced by the
// marker. The summary then leaves the row the step was written on out of its
// parameters (`./result-summary.ts`).
//
// **A saved trace's row is a marker (t482, D3).** The trace a run saves holds
// `{ $datasetRow: { datasetId, ordinal } }` wherever a captured row sat
// (`../executor/record-summary.ts`), and a loop hands its passes the read's
// rows by reference, so each pass's row there is that marker. Read by its
// fields it was `{}` -- the only key is `$`-prefixed -- and lane D round 12
// (`run-mv62icw0-070f88ad`) sent the judges four empty rows. A marker is now
// read back as the stored row it stands for (`capturedRow`,
// `./captured-rows.ts`), and where that row cannot be said for certain, it is
// named by its place among the rows collected rather than sent empty.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioActivityLoops } from "../activity/loop/index.ts";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";

const FOR_EACH = "builtin.control.for-each";
/** A row field minted per read rather than part of the row. */
const MINTED_FIELD = /^\$|handle|evidence/iu;
/** Stands in for a row that cannot be sent. */
const WITHHELD_ROW = "[withheld]";

/** One traced attempt, as far as this reads it. */
type Attempt = {
  nodeId: string;
  route?: string | undefined;
  status?: string | undefined;
  outputs?: Readonly<Record<string, unknown>> | undefined;
  skipped?: unknown;
  stateHeld?: unknown;
};

/**
 * Which steps run per row, and the rows each acted on, in run order. `rows`
 * is absent for a step in no list loop. `withheld` says a row was screened.
 */
export function automationStudioResultStepRows(input: {
  flowNodes: readonly { id: string; definitionId: string }[];
  flowEdges: readonly { sourceNodeId: string; targetNodeId: string; sourcePortId?: string | undefined }[] | undefined;
  attempts: readonly Attempt[] | undefined;
  deniedEvidenceKeys: readonly string[] | undefined;
  /** The stored row a captured-row marker stands for, where it is known (`./captured-rows.ts`). Absent, no marker is read back. */
  capturedRow?: ((datasetId: string, ordinal: number) => JsonObject | undefined) | undefined;
}): { rowBound: ReadonlySet<string>; rows: ReadonlyMap<string, JsonValue[]>; withheld: boolean } {
  const loops = input.flowEdges ? automationStudioActivityLoops({ nodes: input.flowNodes, edges: input.flowEdges }, FOR_EACH) : [];
  const rowBound = new Set(loops.flatMap((loop) => [...loop.members]));
  const rows = new Map<string, JsonValue[]>();
  let withheld = false;
  if (!rowBound.size) return { rowBound, rows, withheld };
  /** Each loop's current pass: its number, its row, and when it began among all passes. */
  const passes = new Map<string, { n: number; row: JsonValue; at: number }>();
  let begun = 0;
  /** The passes each step was already counted in, so a step run twice in one pass names its row once. */
  const counted = new Map<string, Set<string>>();
  for (const attempt of input.attempts ?? []) {
    const loop = loops.find((entry) => entry.repeatId === attempt.nodeId);
    if (loop && attempt.route === "body") {
      passes.set(loop.repeatId, { n: (passes.get(loop.repeatId)?.n ?? 0) + 1, row: rowFields(attempt.outputs?.item, input.capturedRow), at: ++begun });
      continue;
    }
    if (!rowBound.has(attempt.nodeId) || attempt.status !== "succeeded" || attempt.skipped || attempt.stateHeld) continue;
    const holding = loops.filter((entry) => entry.members.has(attempt.nodeId) && passes.has(entry.repeatId));
    // The innermost loop holding it is the one whose pass began last.
    const pass = holding.map((entry) => ({ id: entry.repeatId, ...passes.get(entry.repeatId)! })).sort((a, b) => a.at - b.at).at(-1);
    if (!pass) continue;
    const key = `${pass.id}#${pass.n}`;
    const seen = counted.get(attempt.nodeId) ?? new Set<string>();
    if (seen.has(key)) continue;
    seen.add(key);
    counted.set(attempt.nodeId, seen);
    let row: JsonValue = pass.row;
    if (input.deniedEvidenceKeys === undefined) {
      row = WITHHELD_ROW;
      withheld = true;
    } else {
      const found = screenAutomationStudioLlmEvidence(row, input.deniedEvidenceKeys);
      if (found.deniedKey || found.secretShaped) {
        row = WITHHELD_ROW;
        withheld = true;
      }
    }
    rows.set(attempt.nodeId, [...(rows.get(attempt.nodeId) ?? []), row]);
  }
  return { rowBound, rows, withheld };
}

/** A row as its own fields, without what a read mints afresh; a captured-row marker read back as its stored row (header). */
function rowFields(item: unknown, capturedRow?: (datasetId: string, ordinal: number) => JsonObject | undefined): JsonValue {
  if (Array.isArray(item)) return item.map((entry) => rowFields(entry, capturedRow));
  if (!item || typeof item !== "object") return (item ?? null) as JsonValue;
  const marker = capturedMarker(item);
  if (marker) {
    const stored = capturedRow?.(marker.datasetId, marker.ordinal);
    return stored ? rowFields(stored) : `row ${marker.ordinal} collected into ${marker.datasetId}`;
  }
  const fields: JsonObject = {};
  for (const [key, value] of Object.entries(item)) if (!MINTED_FIELD.test(key)) fields[key] = rowFields(value, capturedRow);
  return fields;
}

/** The dataset and place a saved trace's captured-row marker names, when `item` is one and nothing else. */
function capturedMarker(item: object): { datasetId: string; ordinal: number } | undefined {
  const keys = Object.keys(item);
  if (keys.length !== 1 || keys[0] !== "$datasetRow") return undefined;
  const marker = (item as { $datasetRow?: unknown }).$datasetRow;
  if (!marker || typeof marker !== "object") return undefined;
  const { datasetId, ordinal } = marker as { datasetId?: unknown; ordinal?: unknown };
  return typeof datasetId === "string" && typeof ordinal === "number" && Number.isSafeInteger(ordinal) && ordinal >= 1 ? { datasetId, ordinal } : undefined;
}
