export type WorkspacePresentationFailure = "binding_conflict" | "stale_runtime" | "caller_required" | "context_write_stale" | "runtime_unavailable";

export class WorkspacePresentationError extends Error {
  constructor(readonly code: WorkspacePresentationFailure) {
    super("The selected workspace presentation is unavailable.");
    this.name = "WorkspacePresentationError";
  }
}
