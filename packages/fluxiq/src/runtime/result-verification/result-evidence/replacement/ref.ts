import type { AutomationStudioResultEvidenceSourceRef } from "./source.ts";

/** Read only a complete exact producer tuple; extra or guessed identity fields confer no authority. */
export function readAutomationStudioResultEvidenceSourceRef(value: unknown): AutomationStudioResultEvidenceSourceRef | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return undefined;
  const held = value as Record<string, unknown>;
  if (!Reflect.ownKeys(held).every((entry) => typeof entry === "string" && ["source", "step", "version", "datasetId"].includes(entry)) || !["source", "step", "version"].every((entry) => Object.hasOwn(held, entry))) return undefined;
  if (!identity(held.source) || !identity(held.step) || typeof held.version !== "number" || !Number.isSafeInteger(held.version) || held.version <= 0 || Object.hasOwn(held, "datasetId") && !identity(held.datasetId)) return undefined;
  return { source: held.source, step: held.step, version: held.version, ...(typeof held.datasetId === "string" ? { datasetId: held.datasetId } : {}) };
}

function identity(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
