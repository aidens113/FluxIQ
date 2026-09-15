import { describe, expect, it } from "vitest";
import { runDatasetDownloadHref } from "../download-href";

describe("run dataset download link", () => {
  it("URL-encodes every id and keeps the format", () => {
    expect(runDatasetDownloadHref({
      projectId: "project one/2",
      runId: "run:a b",
      datasetId: "orders?x",
      format: "csv"
    })).toBe("/api/programs/automation-studio/run-datasets/project%20one%2F2/run%3Aa%20b/orders%3Fx?format=csv");
  });

  it("appends the domain scope, as every program request does", () => {
    expect(runDatasetDownloadHref({
      projectId: "p",
      runId: "r",
      datasetId: "d",
      format: "json",
      domainId: "web automation"
    })).toBe("/api/programs/automation-studio/run-datasets/p/r/d?format=json&domainId=web%20automation");
  });

  it("omits the scope only when there is none", () => {
    expect(runDatasetDownloadHref({ projectId: "p", runId: "r", datasetId: "d", format: "csv", domainId: null }))
      .toBe("/api/programs/automation-studio/run-datasets/p/r/d?format=csv");
  });
});
