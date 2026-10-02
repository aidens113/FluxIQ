// The columns a read's own conditions keep empty. The defect it closes:
// `run-muq66ff9-cb3767a1` stored `ad`, filtered on `ad is absent`, and each of
// its three re-authors was told the column was always empty and to re-point it.
// The conditions are read here as `accounts.ts` says them, so the wording this
// relies on is the wording Core actually produces.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadEmptiedColumns } from "../emptied-columns.ts";
import { earbudsAttempt, earbudsNode } from "./earbuds-read.ts";

const AD_READ = { kind: "attribute", selector: ".result-card", attribute: "data-ad", required: false };

/** The earbuds read with an `ad` column and the given first condition. */
function readsWith(condition: JsonObject) {
  const node = earbudsNode();
  const read = node.parameterValues!.extractList as { fields: JsonObject; where: JsonObject[] };
  read.fields.ad = AD_READ;
  read.where[0] = condition;
  return automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [node], deniedEvidenceKeys: [] }).reads;
}

const COLUMNS = ["name", "price", "rating", "url", "ad"];

describe("the columns a read keeps empty by its own conditions", () => {
  it("names a column a condition requires absent, whether by the column's own read or by its key", () => {
    expect(automationStudioResultReadEmptiedColumns(readsWith({ read: { ...AD_READ, required: true }, is: "absent" }), COLUMNS)).toEqual(["ad"]);
    expect(automationStudioResultReadEmptiedColumns(readsWith({ field: "ad", is: "absent" }), COLUMNS)).toEqual(["ad"]);
    expect(automationStudioResultReadEmptiedColumns(readsWith({ field: "ad", is: "present", not: true }), COLUMNS)).toEqual(["ad"]);
  });

  it("names no column a condition requires present, nor one a condition on some other read concerns", () => {
    expect(automationStudioResultReadEmptiedColumns(readsWith({ field: "ad", is: "present" }), COLUMNS)).toEqual([]);
    expect(automationStudioResultReadEmptiedColumns(readsWith({ field: "ad", is: "absent", not: true }), COLUMNS)).toEqual([]);
    expect(automationStudioResultReadEmptiedColumns(readsWith({ read: { ...AD_READ, attribute: "data-sponsored" }, is: "absent" }), COLUMNS)).toEqual([]);
  });

  it("names nothing when no read was accounted, or its wording was withheld", () => {
    expect(automationStudioResultReadEmptiedColumns(undefined, COLUMNS)).toEqual([]);
    expect(automationStudioResultReadEmptiedColumns([{ nodeId: "s8", definitionId: "x", pagesRead: 1, truncated: false, kept: 1, conditions: [{ rejected: 3 }] }], COLUMNS)).toEqual([]);
  });
});
