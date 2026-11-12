// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/task/: each exposed endpoint takes its input's minimal example.

import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { callAcceptedExample, createRunExample } from "../run-example.ts";

describe("Task endpoints for the panel assistant", () => {
  it("take the minimal example of each input", async () => {
    const { registry, cleanup, projectId } = await createRunExample();
    try {
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      await expectExampleAccepted(registry, E.listProjectTasks, { projectId, limit: 10 });
      await expectExampleAccepted(registry, E.listConversationTaskAttempts, { projectId, conversationId: "conversation.none" });
      // Nothing was attempted here, so these name what is missing and are refused by it, never as a bad request.
      const missing: Array<[string, Record<string, unknown>]> = [
        [E.getTaskAttempt, { projectId, attemptId: "attempt.none" }],
        [E.renameTask, { projectId, taskId: "task.none", title: "Weekly report" }],
        [E.updateTaskSettings, { projectId, taskId: "task.none", humanness: 40 }],
        [E.removeTask, { projectId, taskId: "task.none" }],
        [E.runTaskAgain, { projectId, taskId: "task.none" }],
        [E.carryOnTaskAttempt, { projectId, attemptId: "attempt.none", addUsd: 0 }]
      ];
      for (const [endpoint, example] of missing) {
        const response = await callAcceptedExample(registry, endpoint, example);
        expect(response.error ?? "", endpoint).not.toMatch(/does not accept|needs an amount|a name with words|humanness is a whole number/iu);
      }
    } finally {
      await cleanup();
    }
  });
});
