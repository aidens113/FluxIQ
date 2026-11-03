// Strict, for the same reason every other conversation payload is: what a
// person approves has to be exactly what Core built. An unreadable diff shows
// its reference rather than a half-parsed picture of a Flow.

import type { FlowGraphDiff, GraphDiffEntry } from "./flow-graph-diff";

const ID = /^[A-Za-z0-9._:>\/ -]{1,200}$/u;
const MAX_ENTRIES = 50;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export function parseFlowGraphDiff(value: unknown): FlowGraphDiff | null {
  if (!isRecord(value)) return null;
  const added = parseEntries(value.added);
  const removed = parseEntries(value.removed);
  const changed = parseEntries(value.changed);
  if (!added || !removed || !changed) return null;
  const flowId = value.flowId;
  if (flowId !== undefined && flowId !== null && !isName(flowId)) return null;
  return { flowId: typeof flowId === "string" ? flowId : null, added, removed, changed };
}

function parseEntries(value: unknown): GraphDiffEntry[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) return null;
  const entries: GraphDiffEntry[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !isName(candidate.id)) return null;
    if (candidate.label !== undefined && candidate.label !== null && !isSafeText(candidate.label)) return null;
    if (candidate.detail !== undefined && candidate.detail !== null && !isSafeText(candidate.detail)) return null;
    entries.push({
      id: candidate.id,
      label: typeof candidate.label === "string" && candidate.label ? candidate.label : candidate.id,
      detail: typeof candidate.detail === "string" && candidate.detail ? candidate.detail : null
    });
  }
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isName(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300 && !UNSAFE_TEXT.test(value);
}
