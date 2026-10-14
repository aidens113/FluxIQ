// Covers handlers/runtime-sessions.ts (t604): a listing answers one bounded
// page of summaries with the caller's filters and the next cursor, and a page
// too large to send is refused with a code instead of being attempted.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";
import type { AutomationStudioService } from "../../../runtime/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { registerAutomationStudioApi } from "../index.ts";
import { AUTOMATION_STUDIO_RUNTIME_SESSION_LISTING_MAX_BYTES } from "../runtime-sessions.ts";

const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["programs.read"] };

function summary(runId: string, targetId = "flow.one") {
  return { runId, targetKind: "flow", targetId, flowId: "flow.one", status: "succeeded", queuedAt: 1, updatedAt: 1 };
}

async function list(service: object, payload: Record<string, unknown>) {
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service as unknown as AutomationStudioService);
  return await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRuntimeSessions, scope: {}, actor, payload });
}

describe("listing runtime sessions", () => {
  it("answers one page of summaries with the caller's filters and the next cursor, and never lists a full session", async () => {
    const listRuntimeSessionSummaries = vi.fn(async () => ({ runs: [summary("run.two"), summary("run.one")], total: 9, limit: 2, offset: 0, nextCursor: "cursor.next" }));
    const listRuntimeSessions = vi.fn();
    const response = await list({ listRuntimeSessionSummaries, listRuntimeSessions }, { projectId: "project.one", flowId: "flow.one", candidateId: "candidate.one", runIds: ["run.one"], statuses: ["succeeded"], limit: 2, cursor: "cursor.this", summaries: true });

    expect(response).toEqual({ ok: true, payload: { runtimeSessions: [summary("run.two"), summary("run.one")], page: { total: 9, limit: 2, offset: 0, nextCursor: "cursor.next" } } });
    expect(listRuntimeSessionSummaries).toHaveBeenCalledWith("project.one", { limit: 2, offset: undefined, cursor: "cursor.this", flowId: "flow.one", candidateId: "candidate.one", runIds: ["run.one"], statuses: ["succeeded"] });
    // Asked without `summaries: true`, as the Lab once did, it still reads no session's content.
    await list({ listRuntimeSessionSummaries, listRuntimeSessions }, { projectId: "project.one" });
    expect(listRuntimeSessions).not.toHaveBeenCalled();
  });

  it("refuses a page too large to send with a code, and says how to ask for less", async () => {
    // A hundred summaries whose ids alone pass the budget: nothing a summary is built from should ever do this.
    const runs = Array.from({ length: 100 }, (_, index) => summary(`run.${index}`, "t".repeat(Math.ceil(AUTOMATION_STUDIO_RUNTIME_SESSION_LISTING_MAX_BYTES / 90))));
    const response = await list({ listRuntimeSessionSummaries: vi.fn(async () => ({ runs, total: 100, limit: 100, offset: 0, nextCursor: null })) }, { projectId: "project.one", limit: 100 });

    expect(response).toMatchObject({ ok: false, errorCode: "runtime_sessions.listing_too_large" });
    expect((response as { error: string }).error).toMatch(/smaller `limit`/u);
    expect(response).not.toHaveProperty("payload");
  });

  it("answers a refused filter with its code", async () => {
    const refusal = Object.assign(new Error("This runtime session cursor is not one a listing returned; start again without a cursor."), { diagnostic: { code: "runtime_sessions.cursor_invalid" } });
    const response = await list({ listRuntimeSessionSummaries: vi.fn(async () => { throw refusal; }) }, { projectId: "project.one", cursor: "bad" });

    expect(response).toMatchObject({ ok: false, errorCode: "runtime_sessions.cursor_invalid" });
  });
});
