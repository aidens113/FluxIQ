import type { ApiResponse } from "../../programs/program-api";
import { asRecord, numberOf, textOf } from "../../home/model";

export type RestoreAnswer = { kind: "restored"; revision: number } | { kind: "conflict" } | { kind: "refused"; reason: string };

/**
 * What `restore-graph-snapshot` came to: the version the restore was saved as, a conflict
 * (the Flow changed while the history was open), or the engine's reason it was refused.
 */
export function restoreAnswer(response: ApiResponse<unknown>): RestoreAnswer {
  if (!response.ok) {
    if (response.status === 0) return { kind: "refused", reason: "FluxIQ could not be reached, so nothing was restored. Try again." };
    return { kind: "refused", reason: textOf(response.error) ?? "The version could not be restored." };
  }
  const result = asRecord(asRecord(response.payload)?.result);
  if (result?.status === "conflict") return { kind: "conflict" };
  const revision = numberOf(result?.revisionNumber);
  if (result?.status === "applied" && revision !== undefined) return { kind: "restored", revision };
  return { kind: "refused", reason: "FluxIQ answered in a way this page cannot read. Reload the Flow to see whether the version was restored." };
}
