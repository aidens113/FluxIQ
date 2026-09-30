// Covers handlers/activity.ts: the endpoint's permission and classification,
// that it answers with the hub's snapshot of the named project and nothing
// else, and that it refuses a request that names no project.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { AutomationStudioActivityHub } from "../../../runtime/activity/index.ts";
import type { AutomationStudioService } from "../../../runtime/index.ts";
import { cacheActor } from "./test-actor.ts";
import { registerAutomationStudioActivityEndpoints } from "../activity.ts";
import { registerAutomationStudioApi } from "../index.ts";

const readActor = { ...cacheActor("user.reader"), permissions: ["programs.read" as const] };

function activityApi() {
  const hub = new AutomationStudioActivityHub(() => new Date("2026-09-29T10:00:00.000Z"));
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioActivityEndpoints({ registry, activity: hub });
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
    expect(registry.endpoints()).toEqual([{ programId: "automation-studio", endpoint: "get-activity", permission: "programs.read", classification: "read" }]);
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

  it("is registered with the rest of the API, reading the process's own hub without touching the service", async () => {
    const service = vi.fn();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, new Proxy({}, { get: () => service }) as unknown as AutomationStudioService);
    expect(registry.endpoints()).toContainEqual({ programId: "automation-studio", endpoint: "get-activity", permission: "programs.read", classification: "read" });
    const response = await registry.call({ programId: "automation-studio", endpoint: "get-activity", scope: { domainId: null }, actor: readActor, payload: { projectId: "project.never-used-by-any-test" } });
    expect(response).toEqual({ ok: true, payload: { current: null, recent: [] } });
    expect(service).not.toHaveBeenCalled();
  });
});
