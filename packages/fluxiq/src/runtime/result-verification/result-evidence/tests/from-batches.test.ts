import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioResultEvidenceFromBatches } from "../from-batches.ts";

const page = (rows: JsonObject[] = []) => ({ source: "capture.one", step: "reader", version: 1, fields: { title: ".name" }, conditions: [], place: "offset=0", kept: rows.length, rows });
const entry = (rows: JsonObject[] = []) => ({ datasetId: "answer", batchKey: "capture.one", evidence: { pages: [page(rows)], coverage: [], working: [], looks: [] } });

describe("source batch evidence after processing", () => {
  it("uses the source records, never an invented association with processed row counts", () => {
    const raw = [{ title: "B" }, { title: "A" }, { title: "A" }];
    const bundle = automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [entry(raw)], instructionText: "Give columns title." });
    expect(bundle.pages[0]?.rows).toEqual(raw);
    expect(bundle.answerContract).toEqual({ columns: ["title"] });
    expect(bundle.coverage[0]).toMatchObject({ first: "read", places: ["offset=0"] });
    expect(bundle.coverage[0]?.last).not.toHaveProperty("paging");
  });
  it("distinguishes an actual empty page from missing legacy evidence", () => {
    const bundle = automationStudioResultEvidenceFromBatches({ datasets: ["answer", "legacy", "unrecorded"], entries: [entry(), { datasetId: "legacy", batchKey: "old" }] });
    expect(bundle.pages).toEqual([page()]);
    expect(bundle.missingEvidence).toEqual([{ datasetId: "legacy", batchKey: "old" }, { datasetId: "unrecorded" }]);
  });
  it("does not admit an unrelated dataset and omits an unsure column declaration", () => {
    const bundle = automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ ...entry([{ title: "Other" }]), datasetId: "working" }], instructionText: "Give columns title and price exactly as it is printed." });
    expect(bundle.pages).toEqual([]);
    expect(bundle.answerContract).toBeUndefined();
  });
  it("preserves carried/coverage facts and every long source value whole", () => {
    const raw = entry([{ title: "A".repeat(8000) }]);
    const evidence: JsonObject = { ...raw.evidence, pages: [{ ...page([{ title: "A".repeat(8000) }]), carried: true }], coverage: [{ step: "reader", version: 1, places: ["offset=0"], first: "read", last: { place: "offset=0", paging: { verdict: "ended", reason: "No further item" } } }] };
    const bundle = automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ ...raw, evidence }] });
    expect(bundle.pages[0]?.carried).toBe(true);
    expect(bundle.pages[0]?.rows[0]?.title).toHaveLength(8000);
    expect(bundle.coverage[0]?.last?.paging).toEqual({ verdict: "ended", reason: "No further item" });
  });
  it.each([{ pages: [] }, { ...entry().evidence, pages: [{ ...page(), kept: 2 }] }, { ...entry().evidence, pages: [{ ...page(), rows: ["not a row"], kept: 1 }] }])("rejects corrupt evidence instead of presenting it as a valid empty page", (evidence) => {
    expect(() => automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ datasetId: "answer", batchKey: "bad", evidence: evidence as JsonObject }] })).toThrow(/evidence is invalid/u);
  });
});
