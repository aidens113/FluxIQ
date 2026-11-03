// Honouring a scrub request (t745 u5). A protected store calls this at the
// end of every open; with no request recorded it is one read. With one, it
// VACUUMs the project database (rebuilding every page, so no free gap keeps a
// stale cell) and then checkpoints the WAL with truncate (so no old page image
// stays in it), and clears the request only when both succeeded and the
// checkpoint was not busy. Anything less leaves the request for the next
// protected open. A busy or failed VACUUM or checkpoint is reported, never
// thrown; a reason is SQLite's own message (it never quotes row content) or
// an error class name, never a provider's text.
import type { AutomationStudioProjectDatabase, AutomationStudioWalCheckpointResult } from "../database.ts";

export type ContentAddressScrubStage = "vacuum" | "checkpoint" | "clear";

export type ContentAddressScrubStatus =
  | { readonly status: "not-requested" }
  | { readonly status: "done"; readonly checkpoint: AutomationStudioWalCheckpointResult }
  | { readonly status: "busy"; readonly stage: ContentAddressScrubStage; readonly checkpoint?: AutomationStudioWalCheckpointResult }
  | { readonly status: "failed"; readonly stage: ContentAddressScrubStage; readonly reason: string };

/** The database operations a scrub uses. */
export type ContentAddressScrubDatabase = Pick<AutomationStudioProjectDatabase, "get" | "run" | "checkpoint">;

type Attempt<T> = { ok: true; value: T } | { ok: false; status: ContentAddressScrubStatus };

export async function scrubProjectDatabaseIfRequested(database: ContentAddressScrubDatabase): Promise<ContentAddressScrubStatus> {
  const request = await database.get<{ requestedAt: number }>("select requested_at_ms as requestedAt from content_address_scrub_requests where singleton = 1");
  if (request === undefined) return Object.freeze({ status: "not-requested" });
  const vacuumed = await attempt("vacuum", () => database.run("vacuum"));
  if (!vacuumed.ok) return vacuumed.status;
  const checkpointed = await attempt("checkpoint", () => database.checkpoint("truncate"));
  if (!checkpointed.ok) return checkpointed.status;
  const checkpoint = Object.freeze({ ...checkpointed.value });
  if (checkpoint.busy !== 0) return Object.freeze({ status: "busy", stage: "checkpoint", checkpoint });
  const cleared = await attempt("clear", () => database.run("delete from content_address_scrub_requests where singleton = 1 and requested_at_ms = ?", [request.requestedAt]));
  if (!cleared.ok) return cleared.status;
  return Object.freeze({ status: "done", checkpoint });
}

async function attempt<T>(stage: ContentAddressScrubStage, operation: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    const code = errorCode(error);
    if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return { ok: false, status: Object.freeze({ status: "busy", stage }) };
    return { ok: false, status: Object.freeze({ status: "failed", stage, reason: reasonOf(error, code) }) };
  }
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error && typeof error.code === "string") return error.code;
  return undefined;
}

/** SQLite's message for an SQLite error; otherwise only the error's class, since another layer's message may name more. */
function reasonOf(error: unknown, code: string | undefined): string {
  if (code?.startsWith("SQLITE_") && error instanceof Error) return error.message;
  return error instanceof Error ? error.name : typeof error;
}
