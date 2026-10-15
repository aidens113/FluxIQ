// A finished run with the shape of A8 bigbox `run-mv9a4aj0-f9a81d13` (t628), on
// another kind of site: a garden centre's listing read over two pages, under a
// request for every bag of potting soil the shop sells itself. The read keeps a
// scoop -- a row of the wrong kind whose own label says so -- and left out a
// sponsored second copy of a stored bag and two tools by rating. The answer's
// dedupe removed nothing. No task, site, product or answer of any realistic
// scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../request-wording.ts";

/** The request. */
export const SOIL_REQUEST = "Find every bag of potting soil that Greenvale sells itself, ready for pickup today and rated 4.5 or higher. Leave out sponsored listings and list each bag once, with columns name, price and rating.";

/** The stored rows, in stored order: three bags and the scoop. */
const SOIL_ORGANIC = { name: "Greenvale Organic Potting Soil, 8 Quart", price: "$6.97", rating: "4.7" };
export const SOIL_MIX = { name: "Rootwise Potting Soil Mix, 16 Quart", price: "$9.47", rating: "4.6" };
export const SOIL_SCOOP = { name: "Greenvale Potting Soil Scoop, Steel", price: "$12.97", rating: "4.6" };
const SOIL_LARGE = { name: "Mossbank Potting Soil, 25 Quart", price: "$14.47", rating: "4.9" };

/** Left out by the rating bound alone, each a tool and not a bag. */
export const SOIL_SIEVE = "Greenvale Potting Soil Sieve, Bamboo";
export const SOIL_BIN = "Rootwise Potting Soil Bin, Plastic";

/** The read's conditions as the summary names them. */
export const SOIL_CONDITIONS = { sponsored: "sponsored is absent", rating: "rating atLeast 4.5" };

/** The run (header); `duplicates` is what the answer's dedupe removed. */
export function soilRunSummary(duplicates = 0): AutomationStudioRunResultSummary {
  const rows = [SOIL_ORGANIC, SOIL_MIX, SOIL_SCOOP, SOIL_LARGE];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: rows.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "soil", recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["name", "price", "rating"], columnsWithheld: false,
      rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: rows.map((row) => ({ ...row })),
      processing: { collected: rows.length + duplicates, duplicates, filteredOut: 0, cut: 0, kept: rows.length, passes: [{ node: "read", pass: 1, rows: 2, newRows: 2 }, { node: "read", pass: 2, rows: 2 + duplicates, newRows: 2 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: 7, kept: 4, paginates: true,
      conditions: [
        { number: 1, condition: SOIL_CONDITIONS.sponsored, rejected: 1, alone: 1, leftOutOnlyByThis: [SOIL_LARGE.name], leftOutSettled: [SOIL_LARGE.name] },
        { number: 2, condition: SOIL_CONDITIONS.rating, rejected: 2, alone: 2, leftOutOnlyByThis: [`${SOIL_SIEVE} — rating: 4.4`, `${SOIL_BIN} — rating: 4.1`], leftOutSettled: [`${SOIL_SIEVE} — rating: 4.4`, `${SOIL_BIN} — rating: 4.1`] }
      ]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "seller", definitionId: "click" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** The request as a Flow instruction, for the checks that read one. */
const SOIL_INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: SOIL_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** The request text as the verification reads it (`../../verify.ts`). */
export const SOIL_REQUEST_TEXT = `${SOIL_INSTRUCTION.title}\n${SOIL_INSTRUCTION.body}`;

/** The request as a judge's words are held to it, over the run above. */
export function soilWording(): AutomationStudioRequestWording {
  return automationStudioRequestWording([SOIL_INSTRUCTION], soilRunSummary())!;
}

/** Step 0081's shape: a correct no naming the stored scoop and advising to keep only the item asked for. */
export const SCOOP_NO = {
  expected: "Every bag of potting soil Greenvale sells itself, ready for pickup today, rated 4.5 or higher, sponsored listings left out, each once.",
  observed: `Stored 4 rows include "Greenvale Potting Soil Scoop, Steel" ($12.97, 4.6), which is a scoop, not a bag of potting soil.`,
  changed: "Add a condition on the read keeping only rows whose name is a bag of potting soil (exclude scoops, sieves and accessories)."
};

/** Step 0080's shape: a yes that missed the scoop. */
export const SOIL_YES = { expected: SCOOP_NO.expected, observed: "Four rows, every one a Greenvale-sold bag ready for pickup today and rated 4.5 or higher." };

/** Step 0064's shape: an unsure whose doubt is that the dedupe merged two products into one stored row. */
export const DEDUPE_DOUBT = {
  expected: SCOOP_NO.expected,
  observed: `The dedupe key can collapse two distinct products that share every value: "Mossbank Potting Soil, 25 Quart" appears twice on page 2, and only one is stored, so the stored set may be missing a product.`,
  changed: "Dedupe by the product link rather than by every column."
};

/** Step 0065's shape: a no calling two stored rows absent. */
export const ABSENT_NO = {
  expected: SCOOP_NO.expected,
  observed: "Bags of other brands that Greenvale sells (Rootwise Potting Soil Mix, 16 Quart; Mossbank Potting Soil, 25 Quart) appear only as sponsored copies and are absent as non-sponsored rows.",
  changed: "Remove the seller step so the read runs over every result."
};
