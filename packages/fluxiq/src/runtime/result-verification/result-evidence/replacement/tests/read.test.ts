import { expect, it } from "vitest";
import { readAutomationStudioResultEvidenceSourceRef, readAutomationStudioResultEvidenceSourceReplacements } from "../index.ts";

const ref = (source: string) => ({ source, step: "reader", version: 1, datasetId: `read.${source}` });
const receipt = (from = "old", to = "fresh") => ({ kind: "page", from: [ref(from)], to: [ref(to)] });
const metadata = () => ({ version: 1, receipts: [receipt(), receipt("fresh", "latest")] });

it("reads an exact durable chain, keeping fresh copies of every original and replacement identity", () => {
  const raw = metadata();
  const parsed = readAutomationStudioResultEvidenceSourceReplacements(raw);
  expect(parsed).toEqual(raw);
  raw.receipts[0]!.from[0]!.source = "changed";
  expect(parsed?.receipts[0]?.from[0]?.source).toBe("old");
  expect(readAutomationStudioResultEvidenceSourceRef({ source: "call", step: "kept", version: 2 })).toEqual({ source: "call", step: "kept", version: 2 });
});

it.each([
  null,
  { source: "call", step: "kept" },
  { source: " ", step: "kept", version: 1 },
  { source: "call", step: "kept", version: 0 },
  { source: "call", step: "kept", version: Number.MAX_SAFE_INTEGER + 1 },
  { source: "call", step: "kept", version: 1, datasetId: undefined },
  { source: "call", step: "kept", version: 1, position: 1 },
  { source: "call", step: "kept", version: 1, url: "https://example.test" }
])("refuses an incomplete or non-authoritative source identity %#", (value) => {
  expect(readAutomationStudioResultEvidenceSourceRef(value)).toBeUndefined();
});

it.each([
  null,
  { version: 2, receipts: [] },
  { version: 1, receipts: [null] },
  { version: 1, receipts: new Array(1) },
  { version: 1, receipts: [{ ...receipt(), kind: "guessed" }] },
  { version: 1, receipts: [{ ...receipt(), from: [] }] },
  { version: 1, receipts: [{ ...receipt(), to: [] }] },
  { version: 1, receipts: [{ ...receipt(), from: [ref("old"), ref("old")] }] },
  { version: 1, receipts: [{ ...receipt(), to: [ref("fresh"), ref("other")] }] },
  { version: 1, receipts: [receipt("same", "same")] },
  { version: 1, receipts: [receipt(), receipt("old", "different")] },
  { version: 1, receipts: [receipt(), receipt("fresh", "old")] },
  { version: 1, receipts: [receipt()], modelAuthored: true }
])("refuses malformed, conflicting or cyclic optional replacement authority %#", (value) => {
  expect(readAutomationStudioResultEvidenceSourceReplacements(value)).toBeUndefined();
});

it("accepts a many-page collection replacement without inventing a one-to-one page mapping", () => {
  const raw = { version: 1, receipts: [{ kind: "collection", from: [ref("old-1"), ref("old-2")], to: [ref("new-1")] }] };
  expect(readAutomationStudioResultEvidenceSourceReplacements(raw)).toEqual(raw);
});
