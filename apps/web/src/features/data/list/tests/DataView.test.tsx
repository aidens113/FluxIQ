import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Resource } from "../../../home/data";
import type { DatasetRows } from "../../data";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { DataView } from "../DataView";

const now = 10_000_000;
const table = { projectId: "p", flowId: "f1", flowName: "Cheapest listings", runId: "run 1", datasetId: "d1", name: "Listings", rowCount: 12, collectedAt: now - 120_000, runCount: 1, truncated: false };
const html = (tables: Resource<DatasetRows>) => renderToStaticMarkup(<DataView tables={tables} now={now} />);

describe("DataView", () => {
  it("says it is loading", () => {
    expect(html({ state: "loading" })).toContain("Loading your data");
  });
  it("says the data could not be read, without a list", () => {
    const out = html({ state: "error" });
    expect(out).toContain("Could not read your data");
    expect(out).not.toContain('aria-label="Data"');
  });
  it("explains an empty page", () => {
    expect(html({ state: "ready", data: { rows: [], incomplete: false } })).toContain("No data yet");
  });
  it("lists each table with its Flow, row count, age and a link to its run", () => {
    const out = html({ state: "ready", data: { rows: [table], incomplete: false } });
    expect(out).toContain("Listings");
    expect(out).toContain("Cheapest listings");
    expect(out).toContain("12 rows");
    expect(out).toContain("2 min ago");
    expect(out).toContain('href="/runs/run%201"');
    expect(out).toContain('aria-label="Search"');
    expect(out).not.toContain("could not be read");
  });
  it("warns when some projects could not be read", () => {
    expect(html({ state: "ready", data: { rows: [table], incomplete: true } })).toContain("Some projects could not be read");
  });
});
