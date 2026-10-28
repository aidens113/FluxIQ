import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRequestedOutput } from "./contracts.ts";

/**
 * A requested output as a record carries it (`./contracts.ts`, t764), read
 * strictly: at least one part, each with an id and a list of column names.
 * Anything else reads as none, so a damaged declaration holds no run to it.
 */
export function automationStudioFlowRequestedOutput(value: JsonValue | undefined): AutomationStudioFlowRequestedOutput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.parts) || !value.parts.length) return undefined;
  const parts: AutomationStudioFlowRequestedOutput["parts"] = [];
  for (const entry of value.parts) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const { part, columns } = entry;
    if (typeof part !== "string" || !part.trim() || !Array.isArray(columns) || !columns.every((column): column is string => typeof column === "string")) return undefined;
    parts.push({ part, columns: [...columns] });
  }
  return { parts };
}
