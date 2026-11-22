import type { AutomationStudioRecordProcessing } from "../types.ts";

/** A declaration bound to retained fields, or the explicit references that could not be bound. */
export type AutomationStudioRecordProcessingBinding =
  | { ok: true; processing: AutomationStudioRecordProcessing; bindings: Readonly<Record<string, string>> }
  | {
    ok: false;
    issues: string[];
    unresolved: { field: string; reason: "missing" | "ambiguous" | "excluded" }[];
  };
