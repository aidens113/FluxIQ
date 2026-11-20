// Provider-free proof of the result processing (t970) on rows three live runs
// actually collected, against each task's own expected rows.
//
// - `run-mwocg0zw-298c705d` read three pages whole with the marks it needed as
//   columns and never filtered: judged no twice, failed. A declaration over the
//   rows it had read gives exactly the expected rows those pages hold, with the
//   marks it filtered by left out of the answer.
// - `run-mwodpw10-3d5748ab` filtered on the page and kept two accessories; each
//   fix to its condition re-read five pages. One declaration over the rows it
//   had makes the expected answer, in order, with the repeat folded by the
//   path of its link, a derived column, since that run read the same link
//   relative on one page and absolute on the next.
//
// The first declaration written here, `name not contains "charging case"`,
// also left out three real pairs whose names go on to say "Wireless Charging
// Case": the answer's per-condition left-out rows are what shows such a
// condition wrong, which is why the tool answers them and the judge must see
// them (phase 2). The one kept is `name not startsWith`.
// - `run-mwojyaub-a76ac16e` (lane B run 10, $5.02, failed): neither model got the
//   page read to drop a promoted card, collected with no name and its label in
//   another column, nor a suggestions block. One declaration drops both; the
//   32 people left are the expected 32. Their order is not, because that run
//   read page 4 first -- a reading defect no processing can or should repair.
//
// The fixtures are the rows as the runs' own step logs recorded them; the
// expected rows are the scenarios' own expected datasets, copied once.
import { readFileSync } from "node:fs";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY, automationStudioFlowDraftResultProcessingFor } from "../../../../flow-authoring/draft/index.ts";
import { automationStudioLlmSetResultProcessing } from "../answer.ts";

type Recorded = { run: string; rows?: JsonObject[]; pages?: JsonObject[][]; expected: JsonObject[] };

function recorded(name: string): Recorded {
  return JSON.parse(readFileSync(new URL(`./recorded-${name}.json`, import.meta.url), "utf8")) as Recorded;
}

function schemaOf(rows: readonly JsonObject[]): AutomationStudioRecordSchema {
  const ids = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return { schemaVersion: "0.1", fields: ids.map((id) => ({ id, label: id, valueType: "string" })) };
}

/** One call of the tool over the recorded rows, as a loop would make it; the declaration it holds and the rows it answers. */
function setOver(rows: readonly JsonObject[], process: JsonObject) {
  const call = automationStudioLlmSetResultProcessing({
    value: { process },
    held: undefined,
    rowsOf: () => ({ datasetId: "result", schema: schemaOf(rows), rows }),
    now: Date.UTC(2026, 10, 20)
  });
  const evidence = call.answer.evidence as JsonObject;
  expect(evidence.ok).toBe(true);
  return { held: call.held, evidence, kept: evidence.rows as JsonObject[] };
}

describe("result processing over rows live runs collected (t970)", () => {
  it("run-mwocg0zw: the marks the run read become filters, and the answer is the expected rows on the pages it read", () => {
    const run = recorded("run-mwocg0zw");
    const rows = run.pages!.flat();
    const { held, evidence, kept } = setOver(rows, {
      where: [
        { field: "sponsored", is: "absent" },
        { field: "plus", is: "present" },
        { field: "rating", atLeast: 4 },
        { field: "price", lessThan: 50 },
        // An accessory's name starts with what it is; a pair's name may carry "Wireless Charging Case" further on.
        { field: "name", startsWith: ["replacement", "charging case"], not: true }
      ],
      columns: ["name", "price", "rating", "url"]
    });
    expect(kept).toEqual(run.expected);
    expect(kept.every((row) => !("plus" in row) && !("sponsored" in row))).toBe(true);
    expect(evidence).toMatchObject({ read: rows.length, kept: run.expected.length });
    expect(automationStudioFlowDraftResultProcessingFor(held, { datasetId: "anything" })).toEqual(held?.[AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY]);
  });

  it("run-mwodpw10: the accessories its page filter kept leave, and the expected answer stands in order", () => {
    const run = recorded("run-mwodpw10");
    // Its later pages read each link absolute and its first page relative, so the page repeat is the same pair
    // only by the link's path: a derived column folds it, and the answer keeps each link as it was read.
    const { evidence, kept } = setOver(run.rows!, {
      derive: [{ id: "path", from: "url", pattern: "^(?:https?://[^/]+)?(/[^?#]*)" }],
      where: [{ field: "name", startsWith: ["replacement", "charging case"], not: true }],
      dedupe: { by: ["path"] }
    });
    const pathOf = (row: JsonObject) => ({ ...row, url: String(row.url).replace(/^https?:\/\/[^/]+/u, "") });
    expect(kept.map(pathOf)).toEqual(run.expected);
    expect(kept.every((row) => !("path" in row))).toBe(true);
    expect(evidence).toMatchObject({ read: 16, leftOut: 2, repeats: 1, kept: 13 });
    const [condition] = evidence.conditions as JsonObject[];
    expect((condition!.leftOutOnlyByThis as string[]).map((label) => label.split(" ").slice(0, 2).join(" "))).toEqual(["Replacement Ear", "Charging Case"]);
  });

  it("run-mwojyaub: one declaration drops the promoted card and the suggestions block, leaving exactly the expected people", () => {
    const run = recorded("run-mwojyaub");
    const { evidence, kept } = setOver(run.rows!, {
      where: [
        { field: "name", is: "present" },
        { field: "headline", equals: "Promoted", not: true },
        { field: "location", equals: "Promoted", not: true }
      ]
    });
    expect(evidence).toMatchObject({ read: 34, leftOut: 2, kept: 32 });
    expect(kept.some((row) => Object.values(row).includes("Promoted"))).toBe(false);
    const key = (row: JsonObject) => JSON.stringify([row.name, row.headline, row.location]);
    expect(kept.map(key).sort()).toEqual(run.expected.map(key).sort());
    // The order is the run's: it read page 4 first, which processing does not repair.
    expect(kept.slice(0, 3).map((row) => row.name)).toEqual(run.expected.slice(29).map((row) => row.name));
  });
});
