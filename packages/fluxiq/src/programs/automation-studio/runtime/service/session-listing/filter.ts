// What a runtime session listing was asked for, read from a caller's payload.
//
// A project keeps every runtime session it ever ran -- a project build alone
// opens dozens (entry preparations, subflow trials, candidate trials) -- so a
// listing is always one bounded page, narrowed by Flow, by candidate (the
// build whose trials a caller is checking), by run id or by status. A filter
// that is present but malformed is refused rather than dropped: dropping it
// would answer with sessions the caller did not ask for (t604).

import { clampInteger } from "../numbers.ts";
import { decodeAutomationStudioRuntimeSessionCursor, type AutomationStudioRuntimeSessionCursor } from "./cursor.ts";

export const AUTOMATION_STUDIO_RUNTIME_SESSION_PAGE_LIMIT = 100;

/** A caller's listing options, as they arrive. */
export type AutomationStudioRuntimeSessionListingOptions = {
  limit?: unknown;
  offset?: unknown;
  cursor?: unknown;
  flowId?: unknown;
  candidateId?: unknown;
  runIds?: unknown;
  statuses?: unknown;
};

export type AutomationStudioRuntimeSessionListingFilter = {
  limit: number;
  /** Ignored when `cursor` is set. */
  offset: number;
  cursor: AutomationStudioRuntimeSessionCursor | null;
  flowId?: string;
  candidateId?: string;
  runIds?: string[];
  statuses?: string[];
};

const MAX_ID_LENGTH = 200;

export function automationStudioRuntimeSessionListingFilter(options: AutomationStudioRuntimeSessionListingOptions = {}): AutomationStudioRuntimeSessionListingFilter {
  const cursor = options.cursor === undefined || options.cursor === null || options.cursor === "" ? null : decodedCursor(options.cursor);
  const flowId = optionalId(options.flowId, "flowId"), candidateId = optionalId(options.candidateId, "candidateId");
  const runIds = optionalIds(options.runIds, "runIds"), statuses = optionalIds(options.statuses, "statuses");
  return {
    limit: clampInteger(options.limit, 1, AUTOMATION_STUDIO_RUNTIME_SESSION_PAGE_LIMIT, 25),
    offset: cursor ? 0 : clampInteger(options.offset, 0, 1_000_000, 0),
    cursor,
    ...(flowId !== undefined ? { flowId } : {}),
    ...(candidateId !== undefined ? { candidateId } : {}),
    ...(runIds !== undefined ? { runIds } : {}),
    ...(statuses !== undefined ? { statuses } : {})
  };
}

function decodedCursor(value: unknown): AutomationStudioRuntimeSessionCursor {
  const cursor = typeof value === "string" ? decodeAutomationStudioRuntimeSessionCursor(value) : null;
  if (!cursor) throw listingRefusal("runtime_sessions.cursor_invalid", "This runtime session cursor is not one a listing returned; start again without a cursor.");
  return cursor;
}

function optionalId(value: unknown, name: string): string | undefined {
  return value === undefined || value === null ? undefined : requiredId(value, name);
}

function requiredId(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_ID_LENGTH) throw listingRefusal("runtime_sessions.filter_invalid", `The runtime session filter \`${name}\` must be a non-empty id of at most ${MAX_ID_LENGTH} characters.`);
  return value.trim();
}

function optionalIds(value: unknown, name: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > AUTOMATION_STUDIO_RUNTIME_SESSION_PAGE_LIMIT) throw listingRefusal("runtime_sessions.filter_invalid", `The runtime session filter \`${name}\` must list between 1 and ${AUTOMATION_STUDIO_RUNTIME_SESSION_PAGE_LIMIT} ids.`);
  return [...new Set(value.map((entry) => requiredId(entry, name)))];
}

/** A refusal the program registry answers with its code (`_shared/api.ts` reads `diagnostic.code`). */
function listingRefusal(code: string, message: string): Error {
  return Object.assign(new Error(message), { diagnostic: { code } });
}
