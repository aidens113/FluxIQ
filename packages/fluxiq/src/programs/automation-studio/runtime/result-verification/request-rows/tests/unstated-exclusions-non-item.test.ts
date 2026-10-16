// An exclusion of what is not the request's own item is stated (t660, A8 frozen
// pair 6 `run-mvac0nmw-52ed30b2` step 0122, fix 7): "excluding non-<item>
// items", where the item's words were also the words the request searched by,
// was marked as unstated, the call was asked again, and the re-ask lost a true
// claim. A library catalogue, the same shape: the request's item is also its
// search, so its words are no words of an exclusion's own.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording } from "../request-wording.ts";
import { automationStudioRequestUnstatedExclusions } from "../unstated-exclusions.ts";

const REQUEST = "Find every hardcover atlas the branch holds. The search results for hardcover atlases run over two pages; list each with its title and shelf.";
const KEPT = ["Hardcover Atlas of Rivers, CityLib", "Hardcover Atlas of the Night Sky", "Pocket Hardcover Atlas of Coastlines"];
const STAND = "Hardcover Atlas Stand, Oak";

const INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

function summary(): AutomationStudioRunResultSummary {
  const rows = [...KEPT, STAND].map((title, index) => ({ title, shelf: `A${index + 1}` }));
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: rows.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "atlases", recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["title", "shelf"], columnsWithheld: false,
      rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: rows
    }],
    reads: [{ nodeId: "read", definitionId: "extract_list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: rows.length, kept: rows.length, paginates: true, conditions: [] }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

const wording = automationStudioRequestWording([INSTRUCTION], summary())!;
const unstated = (advice: string, named: readonly string[] = []) => automationStudioRequestUnstatedExclusions(advice, wording, named);

describe("an exclusion of what is not the request's own item (t660)", () => {
  it("is not marked where a negating prefix before the item's words is its only word of its own", () => {
    expect(unstated("Add a condition excluding non-atlas items.")).toEqual([]);
    expect(unstated("Exclude non-hardcover-atlas items from the read.")).toEqual([]);
  });

  it("is not marked where its examples name a row beside that kind", () => {
    expect(unstated(`Add a condition to exclude non-atlas items like the ${STAND} row.`)).toEqual([]);
    expect(unstated(`Exclude non-atlas items like "${STAND}".`, [STAND])).toEqual([]);
  });

  it("is not marked where it leaves out anything that is not the item", () => {
    expect(unstated("Add a condition excluding anything that is not a hardcover atlas.")).toEqual([]);
    expect(unstated("Exclude everything other than hardcover atlases.")).toEqual([]);
  });

  it("is still marked where it names a kind of its own", () => {
    expect(unstated("Add a condition excluding accessories.")).toEqual(["excluding accessories"]);
    expect(unstated("Exclude accessories that are not a hardcover atlas.")).toEqual(["Exclude accessories that are not a hardcover atlas"]);
  });

  it("is still marked where the prefix negates words the request never says", () => {
    expect(unstated("Exclude non-fiction books.")).toEqual(["Exclude non-fiction books"]);
  });
});
