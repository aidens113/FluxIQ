import type { ApiResponse } from "../../programs/program-api";
import { asRecord, numberOf, textOf } from "../../home/model";
import { parseOutline } from "./parse-outline";
import type { EditAnswer, FlowChange, FlowConflict, GraphOperation } from "./types";

const UNREACHABLE = "FluxIQ could not be reached, so nothing was saved. Try again.";
const UNREADABLE = "FluxIQ answered in a way this page cannot read, so it cannot tell whether the change was saved. Reload the Flow to see.";

/**
 * What `edit-flow-steps` or `undo-flow-edit` came to: saved (with the new version, its undo
 * and the list as it is now), refused (with the reason, nothing saved), or a conflict (the
 * Flow changed under the editor; nothing saved). A request the endpoint refused before
 * reading it is a refusal with the reason the engine gave.
 */
export function editAnswer(response: ApiResponse<unknown>): EditAnswer {
  if (!response.ok) {
    if (response.status === 0) return { kind: "refused", reason: UNREACHABLE };
    return { kind: "refused", reason: textOf(response.error) ?? "The change was refused, so nothing was saved." };
  }
  const row = asRecord(response.payload);
  if (!row) return { kind: "refused", reason: UNREADABLE };
  const reason = textOf(row.reason);
  if (row.ok === false && reason) return { kind: "refused", reason };
  const outline = parseOutline(row.outline);
  const revision = numberOf(row.revision);
  if (!outline || revision === undefined) return { kind: "refused", reason: UNREADABLE };
  if (row.ok === true) {
    const inverseOperations = Array.isArray(row.inverseOperations) ? row.inverseOperations.flatMap(readOperation) : [];
    return { kind: "saved", revision, inverseOperations, outline };
  }
  const conflict = readConflict(row.conflict);
  if (!conflict) return { kind: "refused", reason: UNREADABLE };
  return { kind: "conflict", conflict, outline, revision };
}

function readOperation(value: unknown): GraphOperation[] {
  const row = asRecord(value);
  return row && textOf(row.op) ? [row as GraphOperation] : [];
}

function readConflict(value: unknown): FlowConflict | undefined {
  const row = asRecord(value);
  const baseRevision = numberOf(row?.baseRevision);
  const currentRevision = numberOf(row?.currentRevision);
  if (!row || baseRevision === undefined || currentRevision === undefined) return undefined;
  return {
    baseRevision,
    currentRevision,
    changedBy: Array.isArray(row.changedBy) ? row.changedBy.flatMap(readChange) : [],
    steps: Array.isArray(row.steps) ? row.steps.flatMap((step) => (typeof step === "string" && step ? [step] : [])) : []
  };
}

function readChange(value: unknown): FlowChange[] {
  const row = asRecord(value);
  const revisionNumber = numberOf(row?.revisionNumber);
  if (!row || revisionNumber === undefined) return [];
  return [{
    revisionNumber,
    madeByLabel: textOf(row.madeByLabel) ?? "Someone",
    message: textOf(row.message) ?? "",
    createdAt: numberOf(row.createdAt) ?? 0
  }];
}
