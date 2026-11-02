import { describe, expect, it } from "vitest";
import type { ExecutableFlowRunStatus } from "../../../../flows/executable/execution/index.ts";
import type { AutomationStudioRunControlSnapshot } from "../../../automation-host/index.ts";
import { AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES, automationStudioRunProgressStatus, type AutomationStudioRunProgressStatus } from "../index.ts";

const running: AutomationStudioRunControlSnapshot = { projectId: "project", runId: "run", state: "running", holder: null, phase: "executing", history: [] };

describe("runtime progress from execution and live control", () => {
  it("maps every persisted execution status without requiring a Studio document", () => {
    const statuses: Array<[ExecutableFlowRunStatus, AutomationStudioRunProgressStatus]> = [
      ["queued", "ready"], ["running", "running"], ["waiting", "waiting"],
      ["succeeded", "completed"], ["failed", "failed"], ["cancelled", "stopped"], ["interrupted", "interrupted"]
    ];
    for (const [status, expected] of statuses) {
      expect(automationStudioRunProgressStatus({ status }, null)).toBe(expected);
      expect(AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES).toContain(expected);
    }
  });

  it("distinguishes recovery, an ordinary pause, a takeover, and a parked question", () => {
    expect(automationStudioRunProgressStatus({ status: "running" }, { ...running, phase: "adapting" })).toBe("adapting");
    expect(automationStudioRunProgressStatus({ status: "running" }, { ...running, state: "paused", holder: "fluxiq" })).toBe("paused");
    expect(automationStudioRunProgressStatus({ status: "running" }, { ...running, state: "paused", holder: "person" })).toBe("user_action_required");
    expect(automationStudioRunProgressStatus({ status: "waiting", trace: { parked: {} } }, null)).toBe("user_action_required");
    expect(automationStudioRunProgressStatus({ status: "running" }, { ...running, state: "pause_requested", holder: "person" })).toBe("running");
  });

  it("keeps terminal execution authoritative over a stale paused control record", () => {
    const paused: AutomationStudioRunControlSnapshot = { ...running, state: "paused", holder: "person", phase: "adapting" };
    expect(automationStudioRunProgressStatus({ status: "succeeded" }, paused)).toBe("completed");
    expect(automationStudioRunProgressStatus({ status: "failed" }, paused)).toBe("failed");
    expect(automationStudioRunProgressStatus({ status: "cancelled" }, paused)).toBe("stopped");
    expect(automationStudioRunProgressStatus({ status: "interrupted" }, paused)).toBe("interrupted");
  });
});
