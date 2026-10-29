// Listing and reading runtime sessions.
//
// A listing answers bounded summaries only -- ids, status, times, counts and a
// candidate trial's closed fields -- one filtered page at a time, newest
// queued first, with a cursor for the next page. A session's content (its
// Flow, trace and evidence) is read by id through `get-runtime-session`. A
// listing once answered every session a project ever ran with all of that
// content, and an A8 project build's persistent workspace grew past what one
// JSON string can hold (`run-mv8mf0x5-95071c06`, t604). A page that would
// still be too large to send is refused with a code, never attempted.

import { AUTOMATION_STUDIO_ENDPOINTS } from "../contracts.ts";
import { automationStudioWithWholeAttemptInputs } from "../../runtime/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";

/** The most a listing answer may serialise to; a page of summaries is a few kilobytes. */
export const AUTOMATION_STUDIO_RUNTIME_SESSION_LISTING_MAX_BYTES = 4 * 1024 * 1024;

export function registerRuntimeSessionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRuntimeSessions,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListRuntimeSessions",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      // `summaries: true` was how a caller asked for this answer before it was the only one; it is accepted and changes nothing.
      const page = await service.listRuntimeSessionSummaries(String(payload.projectId ?? ""), {
        limit: payload.limit, offset: payload.offset, cursor: payload.cursor,
        flowId: payload.flowId, candidateId: payload.candidateId, runIds: payload.runIds, statuses: payload.statuses
      });
      const answer = { runtimeSessions: page.runs, page: { total: page.total, limit: page.limit, offset: page.offset, nextCursor: page.nextCursor } };
      const bytes = serialisedBytes(answer);
      if (bytes === null || bytes > AUTOMATION_STUDIO_RUNTIME_SESSION_LISTING_MAX_BYTES) {
        return { ok: false, errorCode: "runtime_sessions.listing_too_large", error: `This page of runtime sessions is too large to send (${bytes === null ? "beyond what one answer can hold" : `${bytes} bytes`}; the most is ${AUTOMATION_STUDIO_RUNTIME_SESSION_LISTING_MAX_BYTES}). Ask for a smaller \`limit\` or narrow it by \`flowId\`, \`candidateId\` or \`runIds\`.` };
      }
      return { ok: true, payload: answer };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRuntimeSession,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetRuntimeSession",
    accessLevel: "Read",
    resource: endpointResource.projectChild("run", "runId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; runId?: unknown } : {};
      // A saved trace keeps each value once; a client reads every attempt's whole inputs (t377).
      return { ok: true, payload: { runtimeSession: automationStudioWithWholeAttemptInputs(await service.getRuntimeSession(String(payload.projectId ?? ""), String(payload.runId ?? ""))) } };
    }
  });
}

/** The answer's size as sent, or `null` when it cannot be written as one JSON string at all. */
function serialisedBytes(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch (error) {
    if (error instanceof RangeError) return null; // Too long for one string: refused above as too large.
    throw error;
  }
}
