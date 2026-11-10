// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/runtime-sessions.ts: each endpoint takes its input's minimal example.

import { describe, it } from "vitest";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createRunExample } from "../run-example.ts";

describe("Runtime session endpoints for the panel assistant", () => {
  it("take the minimal example of each input", async () => {
    const { registry, cleanup, projectId, flowId, runId } = await createRunExample();
    try {
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      await expectExampleAccepted(registry, E.listRuntimeSessions, { projectId, flowId, statuses: ["queued", "running"] });
      await expectExampleAccepted(registry, E.getRuntimeSession, { projectId, runId });
    } finally {
      await cleanup();
    }
  });
});
