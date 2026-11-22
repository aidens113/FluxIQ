import { expect, it } from "vitest";
import type { AutomationStudioResultEvidenceBundle, AutomationStudioResultEvidencePage } from "../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstResultSourceState } from "../source-state.ts";

const page = (source: string, listKey?: string, where?: string, datasetId?: string): AutomationStudioResultEvidencePage => ({ source, step: "reader", version: 1, conditions: [], fields: { title: ".title" }, rows: [{ title: "Actual" }], kept: 1, invalidCount: 0, ...(listKey === undefined ? {} : { listKey }), ...(where === undefined ? {} : { where }), ...(datasetId === undefined ? {} : { datasetId }) });
const bundle = (pages: AutomationStudioResultEvidencePage[], missingEvidence?: AutomationStudioResultEvidenceBundle["missingEvidence"]): AutomationStudioResultEvidenceBundle => ({ pages, coverage: [], working: [], looks: [], ...(missingEvidence === undefined ? {} : { missingEvidence }) });

it("cannot cross known list/view pairs between complete fresh collection groups", () => {
  const state = automationStudioAnswerFirstResultSourceState();
  state.hold("Missing originals.", bundle([page("old-a", "A", "X"), page("old-b", "B", "Y")]), bundle([]), false, new Map());
  expect(state.supersede(bundle([page("new-a", "A", "Y"), page("new-b", "B", "X")]))).toBe(false);
  expect(state.reason()).toBe("Missing originals.");
  expect(state.supersede(bundle([page("new-a", "A", "X"), page("new-b", "B", "Y")]))).toBe(true);
  expect(state.reason()).toBeUndefined();
});

it("requires only each tuple's known components, without inventing an absent list or view", () => {
  const state = automationStudioAnswerFirstResultSourceState();
  state.hold("Missing originals.", bundle([page("old-a", "A"), page("old-b", undefined, "Y")]), bundle([]), false, new Map());
  expect(state.supersede(bundle([page("new-a", "B", "X")]))).toBe(false);
  expect(state.supersede(bundle([page("new-a", "A", "new-view"), page("new-b", "new-list", "Y")]))).toBe(true);
});

it("captures an observed missing-dataset association even without old pages and accepts its legitimate new capture id", () => {
  const state = automationStudioAnswerFirstResultSourceState();
  const original = bundle([], [{ datasetId: "old-opaque-dataset" }]);
  const observed = bundle([page("observed", "A", "X")]);
  state.hold("Missing original page metadata.", original, observed, false, new Map([["observed", "old-opaque-dataset"]]));
  const checkpoint = JSON.parse(JSON.stringify(state.evidence(observed)));
  expect(checkpoint.pages).toEqual([{ ...observed.pages[0], datasetId: "old-opaque-dataset" }]);
  expect(checkpoint.missingEvidence).toEqual([{ datasetId: "old-opaque-dataset" }]);
  expect(state.supersede(bundle([page("fresh", "A", "Y", "new-opaque-dataset")]))).toBe(false);
  expect(state.supersede(bundle([page("fresh", "A", "X", "new-opaque-dataset")]))).toBe(true);
  const reopened = automationStudioAnswerFirstResultSourceState();
  reopened.hold("Still missing originals.", checkpoint, bundle([]), false, new Map());
  expect(reopened.supersede(bundle([page("fresh", "A", "Y", "another-dataset")]))).toBe(false);
  expect(reopened.supersede(bundle([page("fresh", "A", "X", "another-dataset")]))).toBe(true);
});

it("cannot vacuously match an original page with neither list nor view identity", () => {
  const state = automationStudioAnswerFirstResultSourceState();
  const original = { ...page("old"), place: "page=1", invalidCount: 1 };
  state.hold("Source identity is opaque.", bundle([original]), bundle([]), false, new Map());
  expect(state.supersede(bundle([page("fresh", "A", "X", "new-dataset")]))).toBe(false);
  expect(state.supersede(bundle([page("fresh")]))).toBe(false);
  expect(state.reason()).toBe("Source identity is opaque.");
  // An explicit repair of that exact kept read/version/place remains supported.
  expect(state.replace("reader", { source: "fixed", version: { conditions: [], fields: { title: ".title" } }, place: "page=1", kept: original.rows, invalidCount: 0 }, "fresh-capture")).toBe(1);
  expect(state.reason()).toBeUndefined();
});

it("does not clear a truly unassociated missing dataset merely because another fresh collection is complete", () => {
  const state = automationStudioAnswerFirstResultSourceState();
  const original = bundle([], [{ datasetId: "unknown-source" }]);
  state.hold("The missing source association is unknown.", original, bundle([page("other", "A", "X", "unrelated-dataset")]), false, new Map([["other", "unrelated-dataset"]]));
  expect(state.supersede(bundle([page("fresh", "A", "X", "new-dataset")]))).toBe(false);
  expect(state.reason()).toBe("The missing source association is unknown.");
  expect(state.evidence(bundle([])).missingEvidence).toEqual([{ datasetId: "unknown-source" }]);
});

it("requires every known missing-source tuple, preserving their associations within the dataset", () => {
  const state = automationStudioAnswerFirstResultSourceState();
  const original = bundle([], [{ datasetId: "shared" }]);
  const observed = bundle([page("old-a", "A", "X", "shared"), page("old-b", "B", "Y", "shared")]);
  state.hold("Missing original page metadata.", original, observed, false, new Map());
  expect(state.supersede(bundle([page("new-a", "A", "Y", "fresh"), page("new-b", "B", "X", "fresh")]))).toBe(false);
  expect(state.supersede(bundle([page("new-a", "A", "X", "fresh"), page("new-b", "B", "Y", "fresh")]))).toBe(true);
});
