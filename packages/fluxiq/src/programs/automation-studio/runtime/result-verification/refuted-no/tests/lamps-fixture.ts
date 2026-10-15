// A finished run with the shape of A8 everything-store `run-mv8p0p7c-c8412344`
// (t607), on another kind of site: a shop's listing read over two pages, two
// stored rows that are distinct listings of one product line (one sold with a
// part the request excludes), conditions Core settled and one it did not. No
// task, site, product or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../../request-rows/index.ts";

/** The request. */
export const LAMPS_REQUEST = "List every desk lamp in the shop's lighting results rated 4 or higher, going through every page. Leave out sponsored listings and spare parts such as spare bulbs or lamp shades, list each lamp only once, with columns name, price, rating and url.";

/** The two distinct listings a judge calls one: the plain lamp, and the same line sold with a spare bulb. */
export const LAMP_PLAIN = { name: "Halden Arc Desk Lamp, LED, Brushed Brass", price: "$45.00", rating: "4.5", url: "/shop/halden-arc/p/LMP4K2Q9X1" };
export const LAMP_WITH_BULB = { name: "Halden Arc Desk Lamp, LED, Brushed Brass with Spare Bulbs", price: "$45.00", rating: "4.5", url: "/shop/halden-arc/p/LMP7R3T8Z2" };
export const LAMP_CLAMP = { name: "Corvin Task Desk Lamp, Clamp Mount, Black", price: "$29.00", rating: "4.2", url: "/shop/corvin-task/p/LMP2B6N4C8" };

/** Left out by the sponsored test alone, which Core settled: its read found the marker. */
export const LAMP_SPONSORED = "Lumen Pro Desk Lamp, Dimmable, Matte White";
/** Left out by the rating bound alone, which Core settled: its rating read as 3.6. */
export const LAMP_LOW_RATED = "Pixel Desk Lamp, USB Powered, Slate Grey";
/** Left out by a text condition alone, which Core does not settle. */
export const LAMP_SHADE = "Replacement Lamp Shade for Desk Lamps, Linen, Ivory";

/** The run (header). */
export function lampsRunSummary(): AutomationStudioRunResultSummary {
  const rows = [LAMP_PLAIN, LAMP_CLAMP, LAMP_WITH_BULB];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: rows.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "lamps", recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["name", "price", "rating", "url"], columnsWithheld: false,
      rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: rows.map((row) => ({ ...row })),
      processing: { collected: 4, duplicates: 1, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: "read", pass: 1, rows: 2, newRows: 2 }, { node: "read", pass: 2, rows: 2, newRows: 1 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: 9, kept: 4, paginates: true,
      conditions: [
        { number: 1, condition: "sponsored is absent", rejected: 2, alone: 1, leftOutOnlyByThis: [LAMP_SPONSORED], leftOutSettled: [LAMP_SPONSORED] },
        { number: 2, condition: "rating atLeast 4", rejected: 2, alone: 1, leftOutOnlyByThis: [`${LAMP_LOW_RATED} — rating: 3.6`], leftOutSettled: [`${LAMP_LOW_RATED} — rating: 3.6`] },
        { number: 3, condition: "name not contains [\"Shade\"]", rejected: 1, alone: 1, leftOutOnlyByThis: [LAMP_SHADE], testedLabel: true }
      ]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** The request as a Flow instruction, for the checks that read one. */
export const LAMPS_INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: LAMPS_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** The request text as the verification reads it (`../../verify.ts`). */
export const LAMPS_REQUEST_TEXT = `${LAMPS_INSTRUCTION.title}\n${LAMPS_INSTRUCTION.body}`;

/** The request as a judge's words are held to it, over the run above. */
export function lampsWording(): AutomationStudioRequestWording {
  return automationStudioRequestWording([LAMPS_INSTRUCTION], lampsRunSummary())!;
}

/** The double no of whole test 2, in this site's words: two distinct stored listings called one, the second called an excluded part. */
export const SAME_LAMP_NO = {
  expected: "Every desk lamp rated 4 or higher from every page, each lamp once, without sponsored listings or spare parts.",
  observed: `3 rows stored, all with the four columns, from 2 pages. But two rows are the same lamp: "Halden Arc Desk Lamp ... Brushed Brass" (LMP4K2Q9X1) and "Halden Arc Desk Lamp ... Brushed Brass with Spare Bulbs" (LMP7R3T8Z2); the dedupe key is name, so both survive, and the second names spare bulbs the request excludes.`,
  changed: "Dedupe by the product id in url, and add a condition leaving out names that contain Spare Bulbs."
};
