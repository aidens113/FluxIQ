import type { AutomationStudioRecordProcessing, AutomationStudioRecordProcessingRefusal } from "../types.ts";

/**
 * A declaration bound to retained fields, or the explicit references that could not be bound, with the parser's
 * per-part refusals where the parser refused it (t1070). A refusal about a field a reference could not be bound to
 * is left out of `refusals`: `unresolved` says it, with why.
 */
export type AutomationStudioRecordProcessingBinding =
  | { ok: true; processing: AutomationStudioRecordProcessing; bindings: Readonly<Record<string, string>> }
  | {
    ok: false;
    issues: string[];
    unresolved: { field: string; reason: "missing" | "ambiguous" | "excluded" }[];
    refusals?: AutomationStudioRecordProcessingRefusal[];
  };
