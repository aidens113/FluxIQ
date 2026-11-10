// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/run-control.ts: each endpoint takes its input's minimal example.

import { describe, it } from "vitest";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createRunExample } from "../run-example.ts";

describe("Run control endpoints for the panel assistant", () => {
  it("take the minimal example of each input", async () => {
    const { registry, cleanup, projectId, runId } = await createRunExample();
    try {
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const run = { projectId, runId };
      await expectExampleAccepted(registry, E.getRuntimeRunControl, run);
      await expectExampleAccepted(registry, E.pauseRuntimeSession, { ...run, reason: "Checking something." });
      await expectExampleAccepted(registry, E.resumeRuntimeSession, { ...run, note: "Carry on." });
    } finally {
      await cleanup();
    }
  });
});
