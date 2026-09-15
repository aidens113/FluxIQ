import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AUTOMATION_STUDIO_DATASET_RUN_STATUSES,
  type AutomationStudioDatasetRunStatus,
  type AutomationStudioDatasetRunSummary,
  type AutomationStudioDatasetRunSummaryPage,
  type AutomationStudioRunDatasetSummary
} from "../index.ts";

// The assertions on types are enforced by `tsc --noEmit` (`pnpm --filter @fluxiq/contracts check`),
// which includes this file; vitest runs them as no-ops.
describe("AutomationStudioDatasetRunSummary", () => {
  it("lists exactly the statuses a stored run holds, frozen", () => {
    expect(AUTOMATION_STUDIO_DATASET_RUN_STATUSES).toEqual(["queued", "running", "succeeded", "failed", "cancelled"]);
    expect(Object.isFrozen(AUTOMATION_STUDIO_DATASET_RUN_STATUSES)).toBe(true);
    expectTypeOf<AutomationStudioDatasetRunStatus>().toEqualTypeOf<"queued" | "running" | "succeeded" | "failed" | "cancelled">();
  });

  it("extends a run dataset summary with the run's Flow, status, and start time", () => {
    expectTypeOf<AutomationStudioDatasetRunSummary>().toMatchTypeOf<AutomationStudioRunDatasetSummary>();
    expectTypeOf<AutomationStudioDatasetRunSummary["flowId"]>().toEqualTypeOf<string>();
    expectTypeOf<AutomationStudioDatasetRunSummary["runStatus"]>().toEqualTypeOf<AutomationStudioDatasetRunStatus>();
    expectTypeOf<AutomationStudioDatasetRunSummary["runStartedAt"]>().toEqualTypeOf<number | null>();
    const summary: AutomationStudioDatasetRunSummary = {
      runId: "run.1",
      datasetId: "listings",
      nodeIds: ["node.extract"],
      schemaDigest: "sha256:abc",
      recordCount: 2,
      truncated: false,
      invalidCount: 0,
      updatedAt: 10,
      flowId: "flow.listings",
      runStatus: "queued",
      runStartedAt: null
    };
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  it("pages runs with a nullable cursor", () => {
    expectTypeOf<AutomationStudioDatasetRunSummaryPage>().toEqualTypeOf<{ runs: AutomationStudioDatasetRunSummary[]; nextCursor: string | null }>();
  });
});
