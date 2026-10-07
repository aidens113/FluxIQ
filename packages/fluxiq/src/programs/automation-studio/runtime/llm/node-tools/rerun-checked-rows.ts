// A rerun of a read after a judged test, answered with which of the rows Core's
// check named it keeps now.
//
// **Why (live run `run-mux6naez-6c20f26e`, lane C R3-3).** The build's test was
// judged wrong, and Core's check of the judge's rows said step 9's condition
// "name" alone left out Lumo Audio Drift Pro and two more
// (`judgement.judge.checked`, and per read and condition `checkedRows`,
// `../../result-verification/request-rows/checked-rows-named.ts`). The repair's
// first rerun of that read kept all three, 13 rows; nothing told the model so,
// and it reran the same read six more times (about $0.02) instead of
// completing.
//
// **What is added.** To the rerun's own answer, `checkedRowsNow`: the rows the
// check named that this read now keeps, those it still leaves out, and Core's
// sentence -- when every one is kept, to complete so the Flow is tested again
// (`../../result-verification/request-rows/rerun-rows.ts`). Only for a rerun of
// a step that reads, only in a repair whose judgement carries named rows, and
// only when the answer names the rows it kept. The named rows are not filtered
// by step number: the repair seed and the judgement already share the seed's
// numbers (`../../flow-bootstrap/unfinished-build/test-step-numbers.ts`).
//
// **Where an answer names its rows.** Core names no domain's key. A replayed
// read names its rows under Core's own `readRows` (`rows`, by label,
// `../../result-verification/build-test/read-rows.ts`); a live read holds its
// kept records where the domain declares (`readRowsKey`, `holder.member` --
// the web domain's `read.extracted`), each read by its label as Core labels a
// playback's rows (`../../service/summaries/extraction-summary.ts`): its first
// value with a letter in it that is not an address, else its first value. A
// value under a denied key, or one shaped like a credential, is never a label.
// The labels are only compared: what the model is told names the judgement's
// own rows, which it was already shown.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioRequestRowsAfterRerun, automationStudioRequestRowsNamedOf } from "../../result-verification/request-rows/index.ts";
import { automationStudioEvidenceKey, screenAutomationStudioLlmEvidence } from "../harness/index.ts";

/** The member of a rerun's answer that says which named rows it keeps now. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_CHECKED_ROWS_NOW_KEY = "checkedRowsNow";

/** Core's own member naming a read's rows by label: the judge's key, `readRows` (`../../result-verification/build-test/read-rows.ts`). */
const READ_ROWS_KEY = "readRows";

/** A value that is an address rather than text: Core's label rule's own. */
const ADDRESS = /^(?:[a-z][a-z\d+.-]*:\/\/|\/)/iu;

/**
 * The rerun's answer with `checkedRowsNow` added, or the answer as it came:
 * when the call was no rerun of a read, the repair's judgement names no rows,
 * or the answer names no rows it kept.
 */
export function automationStudioLlmEvidenceRerunCheckedRows(value: JsonValue, input: {
  replaces?: AutomationStudioFlowDraftStep | undefined;
  /** The repair's judgement, as the loop's resume carries it. */
  judgement?: JsonObject | undefined;
  deniedEvidenceKeys?: readonly string[] | undefined;
  /** Where a live read's answer holds its kept records, `holder.member`, as the domain declared it. */
  readRowsKey?: string | undefined;
}): JsonValue {
  if (input.replaces?.effect !== "observe" || !isObject(value)) return value;
  const judge = input.judgement?.judge;
  const named = isObject(judge) ? automationStudioRequestRowsNamedOf(judge.checkedRows) : [];
  if (!named.length) return value;
  const records = keptRecords(value, input.readRowsKey);
  if (!records) return value;
  const labels = rowLabels(records, input.deniedEvidenceKeys ?? []);
  const after = automationStudioRequestRowsAfterRerun(named, labels, input.replaces.position);
  return after ? { ...value, [AUTOMATION_STUDIO_LLM_EVIDENCE_CHECKED_ROWS_NOW_KEY]: { kept: after.kept, stillLeftOut: after.stillLeftOut, said: after.said } } : value;
}

/** The kept rows the answer names: Core's `readRows.rows`, else the list under the domain's declared `holder.member`. */
function keptRecords(value: JsonObject, readRowsKey: string | undefined): readonly JsonValue[] | undefined {
  const named = value[READ_ROWS_KEY];
  if (isObject(named) && Array.isArray(named.rows)) return named.rows;
  const [holder, member, ...more] = readRowsKey?.split(".") ?? [];
  if (!holder || !member || more.length) return undefined;
  const held = value[holder];
  const rows = isObject(held) ? held[member] : undefined;
  return Array.isArray(rows) ? rows : undefined;
}

/** Each record's label (see the header); a record with none is not a row the check could have named. */
function rowLabels(records: readonly JsonValue[], denied: readonly string[]): string[] {
  const deniedKeys = new Set(denied.map(automationStudioEvidenceKey));
  return records.flatMap((record) => {
    if (!isObject(record)) return [];
    const cells = Object.entries(record).flatMap(([key, cell]): string[] =>
      typeof cell === "string" && cell.trim() && !deniedKeys.has(automationStudioEvidenceKey(key)) && !screenAutomationStudioLlmEvidence(cell, []).secretShaped ? [cell.trim()] : []);
    const label = cells.find((cell) => /\p{L}/u.test(cell) && !ADDRESS.test(cell)) ?? cells[0];
    return label === undefined ? [] : [label];
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
