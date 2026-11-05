// @fluxiq-test-group real-sql
// An empty balance at the judge ends the attempt as a budget-out, once, with its result and its saved state.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioLlmProviderError } from "../../../../../../../runtime/models/failures/index.ts";
import { complete, READ_LOANS, runNode, scriptedAttempt } from "../../fake-library.ts";
import { decisions, expectEnded } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("an empty balance at the judge", () => {
  it("ends budget_out once, keeping the rows, and asks nothing more", async () => {
    let judged = 0;
    const attempt = await scriptedAttempt({
      keepLooking: true,
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          if (request.taskKind === "loop_verification") {
            judged += 1;
            throw new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", "No balance.", false);
          }
          return await provider.runTask(request, execution);
        }
      }),
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(judged).toBe(1);
    expect(decisions(attempt)).toHaveLength(2);
    expect(answer.result).toMatchObject({ kind: "rows", label: "unverified" });
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(attempt.said.filter((line) => line.includes("Reached this task's budget"))).toHaveLength(1);
  });
});
