import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES, automationStudioRunProgress, type AutomationStudioRunControlSnapshot } from "../index.ts";

const base: AutomationStudioRunControlSnapshot = { projectId: "p", runId: "r", state: "running", holder: null, phase: "executing", history: [] };

describe("the one progress status a person is shown", () => {
  it("covers every status the product promises", () => {
    const seen = new Set([
      automationStudioRunProgress({ status: "queued" }, null),
      automationStudioRunProgress({ status: "running" }, base),
      automationStudioRunProgress({ status: "waiting" }, null),
      automationStudioRunProgress({ status: "running" }, { ...base, state: "paused", holder: "fluxiq" }),
      automationStudioRunProgress({ status: "running" }, { ...base, phase: "adapting" }),
      automationStudioRunProgress({ status: "waiting", trace: { parked: {} } }, null),
      automationStudioRunProgress({ status: "succeeded" }, null),
      automationStudioRunProgress({ status: "failed" }, null),
      automationStudioRunProgress({ status: "cancelled" }, null)
    ].map((progress) => progress.status));
    expect([...seen].sort()).toEqual([...AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES].sort());
  });

  it("names a takeover as the person's to act on, with what to do next", () => {
    expect(automationStudioRunProgress({ status: "running" }, { ...base, state: "paused", holder: "person" })).toEqual({
      status: "user_action_required",
      label: "User action required",
      detail: "You have control of the page. Finish what you are doing in the browser, then select Continue."
    });
  });

  it("keeps a run running while its pause waits for the step in flight", () => {
    expect(automationStudioRunProgress({ status: "running" }, { ...base, state: "pause_requested", holder: "fluxiq" })).toEqual({
      status: "running",
      label: "Running",
      detail: "Pausing after the current step finishes."
    });
  });

  it("never reports a finished run as paused, whatever its control says", () => {
    expect(automationStudioRunProgress({ status: "cancelled" }, { ...base, state: "paused", holder: "person" }).status).toBe("stopped");
  });
});
