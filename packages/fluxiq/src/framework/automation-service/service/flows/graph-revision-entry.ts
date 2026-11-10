import type { AutomationStudioGraphRevisionRecord } from "../../../persistence/automation/index.ts";

export type AutomationStudioGraphRevisionMadeBy = "person" | "repair" | "assistant" | "system";

/** One saved version of a Flow, in the words a history list shows. */
export type AutomationStudioGraphRevisionEntry = {
  revisionNumber: number;
  /** Who made the change, for a person to read: "A person", "FluxIQ repair", "The assistant". */
  madeByLabel: string;
  madeBy: AutomationStudioGraphRevisionMadeBy;
  message: string;
  createdAt: number;
  /** How many edits this version holds. */
  changeCount: number;
  /** Present when this version can be restored. */
  snapshotSha256: string | null;
};

const LABELS: Record<AutomationStudioGraphRevisionMadeBy, string> = {
  person: "A person",
  repair: "FluxIQ repair",
  assistant: "The assistant",
  system: "FluxIQ"
};

/** Source values are written by the stores; an author naming an adaptation is a FluxIQ repair. */
export function graphRevisionMadeBy(revision: Pick<AutomationStudioGraphRevisionRecord, "source" | "authorId">): AutomationStudioGraphRevisionMadeBy {
  if (revision.source === "assistant_patch") return "assistant";
  if (revision.source === "fluxiq_repair" || (revision.authorId ?? "").startsWith("adaptation")) return "repair";
  if (revision.source === "legacy_import" || revision.authorId === "automation-studio") return "system";
  return "person";
}

export function graphRevisionEntry(revision: AutomationStudioGraphRevisionRecord, snapshotSha256: string | null): AutomationStudioGraphRevisionEntry {
  const madeBy = graphRevisionMadeBy(revision);
  const fallback = revision.source === "legacy_import" ? "First saved version" : revision.source === "snapshot_restore" ? "Restored an earlier version" : "";
  return {
    revisionNumber: revision.revisionNumber,
    madeBy,
    madeByLabel: LABELS[madeBy],
    // The first version is written by the importer in engineering words, so it is always shown in plain ones.
    message: revision.source === "legacy_import" ? fallback : revision.message || fallback,
    createdAt: revision.createdAt,
    changeCount: revision.operationCount,
    snapshotSha256
  };
}
