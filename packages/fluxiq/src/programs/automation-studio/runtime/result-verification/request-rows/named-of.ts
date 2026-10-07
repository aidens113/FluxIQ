// The rows Core's check named, read back from where a judgement value carries
// them (`judgement.judge.checkedRows`,
// `../../flow-bootstrap/unfinished-build/judgement.ts`): the repair loop holds
// the judgement only as a JSON value, and compares a rerun of a read with these
// rows (`rerun-rows.ts`, live run `run-mux6naez-6c20f26e`, R3-3). Anything not
// of that shape is left out; the rest is kept.

import type { AutomationStudioRequestRowsNamed } from "./types.ts";

/** The named rows a value carries, in the shape `checked-rows-named.ts` gives them; none when it carries none. */
export function automationStudioRequestRowsNamedOf(value: unknown): AutomationStudioRequestRowsNamed[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AutomationStudioRequestRowsNamed[] => {
    if (!isObject(entry) || typeof entry.condition !== "string" || !Array.isArray(entry.rows)) return [];
    const where = typeof entry.step === "number" && Number.isSafeInteger(entry.step) ? { step: entry.step } : typeof entry.nodeId === "string" ? { nodeId: entry.nodeId } : undefined;
    if (!where) return [];
    const rows = entry.rows.flatMap((row): AutomationStudioRequestRowsNamed["rows"] => {
      if (!isObject(row) || typeof row.label !== "string" || !row.label.trim()) return [];
      const ids = Array.isArray(row.ids) ? row.ids.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
      return [{ label: row.label, ...(ids.length ? { ids } : {}) }];
    });
    return rows.length ? [{ ...where, condition: entry.condition, rows }] : [];
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
