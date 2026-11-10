// @fluxiq-test-group real-sql
// Covers the assistant declaration in handlers/activity.ts: the endpoint takes its input's minimal example.

import { describe, it } from "vitest";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createRunExample } from "../run-example.ts";

describe("Activity endpoint for the panel assistant", () => {
  it("takes the minimal example of its input", async () => {
    const { registry, cleanup, projectId } = await createRunExample();
    try {
      await expectExampleAccepted(registry, AUTOMATION_STUDIO_ENDPOINTS.getActivity, { projectId });
    } finally {
      await cleanup();
    }
  });
});
