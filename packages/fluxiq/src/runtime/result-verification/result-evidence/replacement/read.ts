import type { AutomationStudioResultEvidenceSourceRef } from "./source.ts";
import type { AutomationStudioResultEvidenceSourceReplacements } from "./types.ts";
import { readAutomationStudioResultEvidenceSourceRef } from "./ref.ts";

/** Optional unreadable authority is unknown, rather than a reason to discard valid task or page evidence. */
export function readAutomationStudioResultEvidenceSourceReplacements(value: unknown): AutomationStudioResultEvidenceSourceReplacements | undefined {
  if (!shape(value, ["version", "receipts"]) || value.version !== 1 || !dense(value.receipts) || !value.receipts.every(receipt)) return undefined;
  const copied = structuredClone(value) as AutomationStudioResultEvidenceSourceReplacements;
  const edges = new Map<string, string[]>();
  for (const item of copied.receipts) {
    const targets = item.to.map(key);
    for (const source of item.from.map(key)) {
      if (edges.has(source)) return undefined; // A historical identity cannot authorise conflicting replacements.
      edges.set(source, targets);
    }
  }
  const finished = new Set<string>();
  const visiting = new Set<string>();
  const acyclic = (source: string): boolean => {
    if (visiting.has(source)) return false;
    if (finished.has(source)) return true;
    visiting.add(source);
    if ((edges.get(source) ?? []).some((target) => !acyclic(target))) return false;
    visiting.delete(source);
    finished.add(source);
    return true;
  };
  return [...edges.keys()].every(acyclic) ? copied : undefined;
}

function receipt(value: unknown): boolean {
  if (!shape(value, ["kind", "from", "to"]) || !(value.kind === "page" || value.kind === "collection") || !dense(value.from) || !dense(value.to) || !value.from.length || !value.to.length || !value.from.every((entry) => readAutomationStudioResultEvidenceSourceRef(entry) !== undefined) || !value.to.every((entry) => readAutomationStudioResultEvidenceSourceRef(entry) !== undefined)) return false;
  if (value.kind === "page" && (value.from.length !== 1 || value.to.length !== 1)) return false;
  const from = value.from.map((entry) => key(entry as AutomationStudioResultEvidenceSourceRef));
  const to = value.to.map((entry) => key(entry as AutomationStudioResultEvidenceSourceRef));
  return new Set(from).size === from.length && new Set(to).size === to.length && from.every((entry) => !to.includes(entry));
}

function dense(value: unknown): value is unknown[] { return Array.isArray(value) && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean); }
function shape(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && required.every((entry) => Object.hasOwn(value, entry)) && Reflect.ownKeys(value).every((entry) => typeof entry === "string" && (required.includes(entry) || optional.includes(entry)));
}
function key(value: AutomationStudioResultEvidenceSourceRef): string { return JSON.stringify([value.source, value.step, value.version, value.datasetId ?? null]); }
