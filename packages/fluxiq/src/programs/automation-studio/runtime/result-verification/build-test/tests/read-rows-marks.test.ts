// The marks the client read on a replayed read's left-out rows reach the judge of a
// build's test as a run's `leftOutMarks` reach the runtime judge (t810): beside each
// entry's rows, aligned, screened as the cells are, and left out when not one per row.
// A hobby club's notice board: no task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { DENIED, SITE, navigate, replayed, report } from "./draft-steps.ts";

const read: AutomationStudioFlowDraftStep = {
  position: 2, id: "d2", iteration: 2, actionId: "web.output.dom-extract_list",
  input: { node: "web.output.dom-extract_list", parameters: { extractList: { item: { handle: "e9" } } } },
  ranWith: { node: "web.output.dom-extract_list", parameters: { extractList: { item: ".notice" } } },
  effect: "observe", proposes: true, disposition: "kept", replay: { from: { location: SITE } }
};
const OFFER = { kind: "outside", said: "Join club", entity: "Chess Circle" };

function readRowsOf(readRows: JsonObject): JsonObject {
  const start = navigate(1);
  const summary = automationStudioBuildTestResultSummary({
    steps: [start, read],
    report: report([replayed(start), replayed(read)], [[read, { ok: true, code: "core.replay.replayed", said: "the step ran again: kept 1 rows", readRows }]]),
    nodes: [], instructionText: "List the notices from my clubs.", startLocation: SITE, deniedEvidenceKeys: [...DENIED, "password"]
  });
  return (summary.buildTest?.steps.find((step) => step.step === 2)?.observed as JsonObject).readRows as JsonObject;
}

describe("marks on a replayed read's left-out rows (t810)", () => {
  it("carries each entry's marks beside its rows, and a together set's", () => {
    const shown = readRowsOf({
      leftOutOnlyByThis: [{ condition: "club", rows: [{ club: "Ann Lee" }, { club: "Chess Circle" }], marks: [null, [OFFER]] }],
      leftOutTogether: [{ conditions: ["club", "posted"], conditionIndexes: [0, 1], rows: [{ club: "Bo Kim" }], marks: [[OFFER]] }]
    });
    expect(shown).toMatchObject({ leftOutOnlyByThis: [{ rows: ["Ann Lee", "Chess Circle"], marks: [null, [OFFER]] }], leftOutTogether: [{ rows: ["Bo Kim"], marks: [[OFFER]] }] });
  });
  it("says a credential-shaped entity as withheld and leaves out marks that are not one per row", () => {
    const shown = readRowsOf({
      leftOutOnlyByThis: [
        { condition: "club", rows: [{ club: "Ann Lee" }], marks: [[{ kind: "outside", said: "Join", entity: "sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" }]] },
        { condition: "posted", rows: [{ club: "Bo Kim" }, { club: "Cy Ode" }], marks: [[OFFER]] }
      ]
    });
    const entries = shown.leftOutOnlyByThis as JsonObject[];
    expect(entries[0]).toMatchObject({ marks: [[{ kind: "outside", said: "Join", entity: "(withheld)" }]] });
    expect(entries[1]).toMatchObject({ rows: ["Bo Kim", "Cy Ode"] });
    expect(entries[1]).not.toHaveProperty("marks");
  });
});
