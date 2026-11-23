import { expect, it } from "vitest";
import { readAutomationStudioAnswerFirstResultEvidence } from "../index.ts";
import { automaticFeed } from "./automatic-support.ts";

function bundle() {
  const p = automaticFeed({ columns: ["title"] });
  p.read("one", [{ id: "a", title: "Actual", price: "$2", promoted: false }]);
  return JSON.parse(JSON.stringify(p.feed.evidence()));
}

it("accepts and freshly copies a complete real source bundle", () => {
  const raw = bundle();
  const parsed = readAutomationStudioAnswerFirstResultEvidence(raw);
  expect(parsed).toEqual(raw);
  raw.pages[0].rows[0].title = "changed";
  expect(parsed?.pages[0]?.rows[0]?.title).toBe("Actual");
});

it.each([null, { version: 99, receipts: [] }, { version: 1, receipts: [null] }, { broken: () => "not cloneable" }])("keeps all valid page/account facts when optional replacement authority is unreadable %#", (sourceReplacements) => {
  const original = bundle();
  const parsed = readAutomationStudioAnswerFirstResultEvidence({ ...original, sourceReplacements });
  expect(parsed).toEqual({ ...original, sourceReplacements: null });
  expect(parsed?.pages[0]?.rows[0]?.title).toBe("Actual");
  expect(parsed?.pages[0]?.invalidCount).toBe(0);
  expect(parsed?.processing).toEqual(original.processing);
});

it.each([
  ["coverage null", (raw: ReturnType<typeof bundle>) => { raw.coverage = [null]; }],
  ["coverage places", (raw: ReturnType<typeof bundle>) => { raw.coverage[0].places = [42]; }],
  ["coverage last", (raw: ReturnType<typeof bundle>) => { raw.coverage[0].last = { place: "page=1", paging: { verdict: "invented" } }; }],
  ["page place", (raw: ReturnType<typeof bundle>) => { raw.pages[0].place = {}; }],
  ["page where", (raw: ReturnType<typeof bundle>) => { raw.pages[0].where = 42; }],
  ["page list identity", (raw: ReturnType<typeof bundle>) => { raw.pages[0].listKey = []; }],
  ["page position", (raw: ReturnType<typeof bundle>) => { raw.pages[0].position = -1; }],
  ["page dataset identity", (raw: ReturnType<typeof bundle>) => { raw.pages[0].datasetId = " "; }],
  ["unreadable page dataset", (raw: ReturnType<typeof bundle>) => { raw.pages[0].datasetId = {}; }],
  ["negative source validation", (raw: ReturnType<typeof bundle>) => { raw.pages[0].invalidCount = -1; }],
  ["unreadable source validation", (raw: ReturnType<typeof bundle>) => { raw.pages[0].invalidCount = "0"; }],
  ["unsafe source validation", (raw: ReturnType<typeof bundle>) => { raw.pages[0].invalidCount = Number.MAX_SAFE_INTEGER + 1; }],
  ["page annotation", (raw: ReturnType<typeof bundle>) => { raw.pages[0].leftOut = { sets: [{ kind: "alone", conditions: ["zero"], rows: [] }] }; }],
  ["answer contract", (raw: ReturnType<typeof bundle>) => { raw.answerContract = { columns: [{}] }; }],
  ["working", (raw: ReturnType<typeof bundle>) => { raw.working = [{ step: "working", kept: -1 }]; }],
  ["processing count", (raw: ReturnType<typeof bundle>) => { raw.processing.kept = 0.5; }],
  ["processing filter", (raw: ReturnType<typeof bundle>) => { raw.processing.filters = [{ condition: "test", leftOut: 1, leftOutOnlyByThis: [{}] }]; }],
  ["missing source", (raw: ReturnType<typeof bundle>) => { raw.missingEvidence = [{ datasetId: "items", batchKey: {} }]; }],
  ["unknown member", (raw: ReturnType<typeof bundle>) => { raw.fabricated = "not in the evidence contract"; }]
] as const)("refuses malformed persisted %s without dropping it or treating a partial parser as full validation", (_name, change) => {
  const raw = bundle();
  change(raw);
  expect(readAutomationStudioAnswerFirstResultEvidence(raw)).toBeUndefined();
});
