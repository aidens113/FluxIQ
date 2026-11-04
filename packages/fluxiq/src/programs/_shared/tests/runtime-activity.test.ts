// A task attempt in flight is work the runtime reports (`activity().taskAttemptsInFlight`), with no
// project database open and no gateway session: an attempt waiting on a person holds neither, and
// the workspace manager evicts a runtime that reports nothing.

import { describe, expect, it } from "vitest";
import { trackAutomationStudioTaskAttempt } from "../../../framework/automation-service/service/answer-first/attempt-in-flight/index.ts";
import { createGlobalProgramRuntime } from "../../index.ts";

describe("global runtime activity", () => {
  it("reports an attempt waiting on a person as work, and nothing once it ended or threw", async () => {
    const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
    try {
      expect(runtime.activity()).toEqual({ openProjectDatabases: 0, backgroundTasksRunning: 0, backgroundTasksScheduled: 0, openGatewaySessions: 0, taskAttemptsInFlight: 0 });
      let answer!: () => void;
      const waiting = trackAutomationStudioTaskAttempt(runtime.automationStudio, () => new Promise<void>((resolve) => { answer = resolve; }));
      expect(runtime.activity()).toEqual({ openProjectDatabases: 0, backgroundTasksRunning: 0, backgroundTasksScheduled: 0, openGatewaySessions: 0, taskAttemptsInFlight: 1 });
      answer();
      await waiting;
      expect(runtime.activity().taskAttemptsInFlight).toBe(0);
      await expect(trackAutomationStudioTaskAttempt(runtime.automationStudio, async () => { throw new Error("stopped"); })).rejects.toThrow("stopped");
      expect(runtime.activity().taskAttemptsInFlight).toBe(0);
    } finally {
      await runtime.automationStudio.close();
      runtime.secretKeys.close();
    }
  });
});
