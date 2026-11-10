// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/datasets.ts: each endpoint takes its input's minimal example.

import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { callAcceptedExample, createRunExample } from "../run-example.ts";

describe("Dataset endpoints for the panel assistant", () => {
  it("take the minimal example of each input", async () => {
    const { registry, cleanup, projectId, flowId, runId } = await createRunExample();
    try {
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const run = { projectId, runId };
      await expectExampleAccepted(registry, E.listRunDatasets, run);
      await expectExampleAccepted(registry, E.listProjectDatasets, { projectId, flowId, limit: 10 });
      await expectExampleAccepted(registry, E.deleteRunDatasets, run, { authorizationPin: "0000" });
      // The run collected no table, so naming one is refused by what is missing, never as a bad request.
      const named = { ...run, datasetId: "dataset.none" };
      const examples: Array<[string, Record<string, unknown>]> = [
        [E.getRunDatasetPage, { ...named, limit: 20 }],
        [E.exportRunDataset, { ...named, format: "csv" }],
        [E.listDatasetRuns, { projectId, flowId, datasetId: "dataset.none" }]
      ];
      for (const [endpoint, example] of examples) {
        const response = await callAcceptedExample(registry, endpoint, example);
        expect(response.error ?? "", endpoint).not.toMatch(/payload|invalid|needs/iu);
      }
    } finally {
      await cleanup();
    }
  });
});
