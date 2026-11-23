import { isJsonValue } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../core/index.ts";

/** A new task's instruction declaration, before its written field names bind to captured schema. Null explicitly declares an action-only task; {} means the declaration is missing. */
export type AutomationStudioFlowTaskProcessing = { process?: JsonValue } | null;

/**
 * Read the transport envelope without pretending the still-unbound processing has been validated.
 * `{ process: null }` is the action-only declaration, as the chat's interpretation and `core.set_result_processing`
 * both read `process: null`; it is never a data declaration whose null criteria no captured schema could bind.
 */
export function readAutomationStudioFlowTaskProcessing(value: unknown): AutomationStudioFlowTaskProcessing | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "process")) return undefined;
  if (!Object.hasOwn(value, "process")) return {};
  const process = (value as Record<string, unknown>).process;
  if (process === null) return null;
  return isJsonValue(process) ? { process: structuredClone(process) } : undefined;
}
