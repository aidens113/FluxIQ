import { isJsonValue } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../core/index.ts";

/** A new task's instruction declaration, before its written field names bind to captured schema. Null explicitly declares an action-only task; {} means the declaration is missing. */
export type AutomationStudioFlowTaskProcessing = { process?: JsonValue } | null;

/** Read the transport envelope without pretending the still-unbound processing has been validated. */
export function readAutomationStudioFlowTaskProcessing(value: unknown): AutomationStudioFlowTaskProcessing | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "process")) return undefined;
  if (!Object.hasOwn(value, "process")) return {};
  const process = (value as Record<string, unknown>).process;
  return isJsonValue(process) ? { process: structuredClone(process) } : undefined;
}
