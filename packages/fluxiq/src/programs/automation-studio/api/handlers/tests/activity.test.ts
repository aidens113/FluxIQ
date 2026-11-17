// Covers handlers/activity.ts: the endpoint's permission and classification,
// that it answers with the hub's snapshot of the named project and nothing
// else, and that it refuses a request that names no project.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../api-contracts/automation.ts";
import { AutomationStudioActivityHub } from "../../../../../runtime/automation-activity/index.ts";
import type { AutomationStudioService } from "../../../../../framework/automation-service/index.ts";
import { cacheActor } from "./test-actor.ts";
import { registerAutomationStudioActivityEndpoints } from "../activity.ts";
import { registerAutomationStudioApi } from "../index.ts";

const readActor = { ...cacheActor("user.reader"), permissions: ["programs.read" as const] };

function activityApi(held: ReadonlySet<string> = new Set(["project.one", "project.other", "project.quiet"])) {
  const hub = new AutomationStudioActivityHub(() => new Date("2026-09-29T10:00:00.000Z"));
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioActivityEndpoints({ registry, activity: hub, holds: async (projectId) => held.has(projectId) });
  const call = (payload: unknown) => registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getActivity, scope: { domainId: null }, actor: readActor, payload });
  return { hub, registry, call };
}

function publishRun(hub: AutomationStudioActivityHub, projectId: string, label: string, final = false) {
  return hub.publish({
    activityId: `run.${projectId}`,
    subject: { kind: "run", id: `run.${projectId}`, projectId },
    phase: final ? "done" : "running",
    label,
    step: { index: 2, count: 5, nodeId: "node.open" },
    detail: { kind: "step", title: "Open the listing", status: "started", ref: "node.open" },
    ...(final ? { final: true } : {})
  });
}

describe("Automation Studio activity API", () => {
  it("registers get-activity as a read under programs.read", () => {
    const { registry } = activityApi();
    expect(AUTOMATION_STUDIO_ENDPOINTS.getActivity).toBe("get-activity");
    expect(registry.endpoints()).toEqual([expect.objectContaining({ programId: "automation-studio", endpoint: "get-activity", permission: "programs.read", classification: "read" })]);
  });

  it("answers with the named project's current event and the events before it, oldest first", async () => {
    const { hub, call } = activityApi();
    publishRun(hub, "project.one", "Running step 2 of 5");
    publishRun(hub, "project.other", "Somewhere else");
    publishRun(hub, "project.one", "Finished", true);

    const response = await call({ projectId: "project.one" });

    expect(response.ok).toBe(true);
    const payload = (response as { payload: { current: { label: string; final?: boolean; sequence: number } | null; recent: Array<{ label: string }> } }).payload;
    expect(payload.current).toMatchObject({ label: "Finished", final: true, sequence: 3, at: "2026-09-29T10:00:00.000Z" });
    expect(payload.recent.map((event) => event.label)).toEqual(["Running step 2 of 5", "Finished"]);
  });

  it("answers an empty snapshot for a project that has done nothing yet", async () => {
    const { call } = activityApi();
    expect(await call({ projectId: "project.quiet" })).toEqual({ ok: true, payload: { current: null, recent: [] } });
  });

  it("hands out a copy, so a reader cannot change what the hub keeps", async () => {
    const { hub, call } = activityApi();
    publishRun(hub, "project.one", "Running step 2 of 5");
    const first = await call({ projectId: "project.one" }) as { payload: { recent: unknown[] } };
    first.payload.recent.length = 0;
    expect(hub.snapshot("project.one").recent).toHaveLength(1);
  });

  it("refuses a request that names no project", async () => {
    const { call } = activityApi();
    for (const payload of [{}, { projectId: "" }, { projectId: "   " }, { projectId: 7 }, null]) {
      expect(await call(payload)).toEqual({ ok: false, error: "Reading live activity needs a project ID." });
    }
  });

  it("answers a project this instance does not hold exactly as an unknown one, though the process's hub has its activity", async () => {
    // One process, two tenants' runtimes, one hub: project.elsewhere is another instance's.
    const { hub, call } = activityApi(new Set(["project.one"]));
    publishRun(hub, "project.elsewhere", "Another tenant's authored step");
    const elsewhere = await call({ projectId: "project.elsewhere" });
    const unknown = await call({ projectId: "project.nobody" });
    expect(elsewhere).toEqual({ ok: true, payload: { current: null, recent: [] } });
    expect(elsewhere).toEqual(unknown);
    expect(JSON.stringify(elsewhere)).not.toContain("Another tenant");
  });

  it("fails, rather than answering, when this instance's catalogue cannot be read", async () => {
    const hub = new AutomationStudioActivityHub();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioActivityEndpoints({ registry, activity: hub, holds: async () => { throw new Error("catalogue unreadable"); } });
    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getActivity, scope: { domainId: null }, actor: readActor, payload: { projectId: "project.one" } });
    expect(response).toMatchObject({ ok: false });
  });

  it("is registered with the rest of the API without touching the service, and asks only the catalogue's holdings when called", async () => {
    const touched = vi.fn();
    const holds = vi.fn(async () => false);
    const registry = new GlobalProgramApiRegistry();
    const service = new Proxy({}, { get: (_target, name) => (name === "projects" ? { held: { holds } } : touched) });
    registerAutomationStudioApi(registry, service as unknown as AutomationStudioService);
    expect(registry.endpoints()).toContainEqual(expect.objectContaining({ programId: "automation-studio", endpoint: "get-activity", permission: "programs.read", classification: "read" }));
    expect(holds).not.toHaveBeenCalled();
    const response = await registry.call({ programId: "automation-studio", endpoint: "get-activity", scope: { domainId: null }, actor: readActor, payload: { projectId: "project.never-used-by-any-test" } });
    expect(response).toEqual({ ok: true, payload: { current: null, recent: [] } });
    expect(holds).toHaveBeenCalledWith("project.never-used-by-any-test");
    expect(touched).not.toHaveBeenCalled();
  });
});
