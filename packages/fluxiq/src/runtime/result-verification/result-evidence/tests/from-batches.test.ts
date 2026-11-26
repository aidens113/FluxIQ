import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioResultEvidenceFromBatches } from "../from-batches.ts";

const page = (rows: JsonObject[] = []) => ({ source: "capture.one", step: "reader", version: 1, fields: { title: ".name" }, conditions: [], place: "offset=0", kept: rows.length, rows });
const entry = (rows: JsonObject[] = []) => ({ datasetId: "answer", batchKey: "capture.one", evidence: { pages: [page(rows)], coverage: [], working: [], looks: [] } });

describe("source batch evidence after processing", () => {
  it("preserves observed raw dataset association and whole-dataset missing provenance through publication evidence", () => {
    const raw = entry([{ title: "Safe original" }]);
    const evidence = { ...raw.evidence, pages: [{ ...raw.evidence.pages[0]!, datasetId: "shared.raw", invalidCount: 0 }], missingEvidence: [{ datasetId: "shared.raw" }] };
    const result = automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ ...raw, evidence }] });
    expect(result.pages[0]).toMatchObject({ datasetId: "shared.raw", invalidCount: 0 });
    expect(result.missingEvidence).toEqual([{ datasetId: "shared.raw" }]);
    for (const datasetId of ["", " ", 4, null]) expect(() => automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ ...raw, evidence: { ...evidence, pages: [{ ...evidence.pages[0]!, datasetId }] } }] })).toThrow("dataset provenance");
  });
  it("preserves actual source validation counts and keeps legacy absence unknown", () => {
    const raw = entry([{ title: "Safe original" }]);
    const evidence = { ...raw.evidence, pages: [{ ...raw.evidence.pages[0]!, invalidCount: 2 }] };
    expect(automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ ...raw, evidence }] }).pages[0]?.invalidCount).toBe(2);
    expect(automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [raw] }).pages[0]).not.toHaveProperty("invalidCount");
    for (const invalidCount of [-1, 0.5, "0", null, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ ...raw, evidence: { ...raw.evidence, pages: [{ ...raw.evidence.pages[0]!, invalidCount }] } }] })).toThrow("validation provenance");
    }
  });
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
  it("carries the stored processing account to a finished run's judge (t970): the declaration and the rows each filter left out", () => {
    const processing = { declared: { where: [{ field: "title", contains: "cover", not: true }] }, collected: 3, leftOut: 1, repeats: 0, cut: 0, kept: 2, filters: [{ condition: "title not contains \"cover\"", leftOut: 1, leftOutOnlyByThis: ["Table with cover"] }] };
    const stored = entry([{ title: "Chair" }, { title: "Bench" }, { title: "Table with cover" }]);
    const bundle = automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ ...stored, evidence: { ...stored.evidence, processing } }] });
    expect(bundle.processing).toEqual(processing);
    expect(automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [entry()] })).not.toHaveProperty("processing");
  });
  it("keeps a working read's page with its rows and an older bundle's working count (t1048)", () => {
    const working = { ...page([{ title: "Cheaper chair" }]), source: "capture.working", step: "finder" };
    const stored = entry([{ title: "Chair" }]);
    const bundle = automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ ...stored, evidence: { ...stored.evidence, working: [working, { step: "older", kept: 4 }] } }] });
    expect(bundle.working).toEqual([working, { step: "older", kept: 4 }]);
  });
  it.each([{ pages: [] }, { ...entry().evidence, pages: [{ ...page(), kept: 2 }] }, { ...entry().evidence, pages: [{ ...page(), rows: ["not a row"], kept: 1 }] }, { ...entry().evidence, working: [{ ...page([{ title: "A" }]), kept: 3 }] }])("rejects corrupt evidence instead of presenting it as a valid empty page", (evidence) => {
    expect(() => automationStudioResultEvidenceFromBatches({ datasets: ["answer"], entries: [{ datasetId: "answer", batchKey: "bad", evidence: evidence as JsonObject }] })).toThrow(/evidence is invalid/u);
  });
});
