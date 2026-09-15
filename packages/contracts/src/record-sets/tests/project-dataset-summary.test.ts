import { describe, expect, expectTypeOf, it } from "vitest";
import type { AutomationStudioProjectDatasetSummary, AutomationStudioProjectDatasetSummaryPage } from "../index.ts";

// The assertions on types are enforced by `tsc --noEmit` (`pnpm --filter @fluxiq/contracts check`),
// which includes this file; vitest runs them as no-ops.
describe("AutomationStudioProjectDatasetSummary", () => {
  it("names a table by Flow and dataset id and summarizes its newest run", () => {
    expectTypeOf<AutomationStudioProjectDatasetSummary>().toEqualTypeOf<{
      flowId: string;
      datasetId: string;
      label?: string;
      latestRunId: string;
      latestUpdatedAt: number;
      runCount: number;
      latestRecordCount: number;
      latestTruncated: boolean;
      schemaDigest: string;
      encryptedFieldIds?: string[];
    }>();
    const summary: AutomationStudioProjectDatasetSummary = {
      flowId: "flow.listings",
      datasetId: "listings",
      latestRunId: "run.2",
      latestUpdatedAt: 20,
      runCount: 2,
      latestRecordCount: 3,
      latestTruncated: false,
      schemaDigest: "sha256:abc"
    };
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  it("pages tables with a nullable cursor", () => {
    expectTypeOf<AutomationStudioProjectDatasetSummaryPage>().toEqualTypeOf<{ datasets: AutomationStudioProjectDatasetSummary[]; nextCursor: string | null }>();
    const page: AutomationStudioProjectDatasetSummaryPage = { datasets: [], nextCursor: null };
    expect(page.nextCursor).toBeNull();
  });
});
