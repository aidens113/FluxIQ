// A finished run with the shape of A8 frozen pair 4 `run-mva446jf-926a3c72`
// (t651), on another kind of site: a hardware store's drill search read over
// two pages, whose request names the store's own house name as the seller.
// The read kept two drills by three conditions: a delivery text test of the
// request's own words over a delivery column, a rating bound, and a condition
// over a column it called `seller` -- read, in the run's shape, from the
// product's own title, so `startsWith "<house name>"` tests the name, and the
// drills it alone left out are ones the request asks for. Where asked, that
// column is a real seller line instead. A judge's no over it is in
// `./hardware-readings-fixture.ts`, the plans the revisions wrote in
// `../../standing-no-record/tests/hardware-plans-fixture.ts`. No task, site, item or answer of any
// realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import type { AutomationStudioResultReadCondition } from "../../read-condition.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../../request-rows/index.ts";

/** The store's house name: a word of the request, said as the site and as the seller. */
export const HOUSE = "Brackenwood";

/** The request: the house name said twice, the alternative it excludes three words after the second. */
const HARDWARE_REQUEST = `On ${HOUSE}, list every cordless drill that ${HOUSE} sells itself rather than a marketplace seller, ready for delivery tomorrow and rated 4 or higher, going through every page. List each drill once, with columns name, price and rating.`;

/** The read step. */
export const DRILL_READ = "node.bootstrap.9a1c.find_drills.s6";

/** The two stored drills. */
export const DRILL_PRO = { name: `${HOUSE} Pro 18V Cordless Drill, 2 Batteries`, price: "$89.00", rating: "4.6" };
const DRILL_COMPACT = { name: `${HOUSE} Compact 12V Drill Driver`, price: "$59.00", rating: "4.4" };

/** Left out by the seller condition alone: drills the store sells itself whose names do not start with its house name. */
export const DRILL_TORVIK = "Torvik 20V Brushless Drill Kit";
export const DRILL_HALDEN = "Halden 18V Cordless Drill, Bare Tool";
export const DRILL_ORMSBY = "Ormsby Right-Angle Drill, 12V";
/** Left out by the delivery condition alone, its delivery read failing the request's words. */
export const DRILL_SLOW = `${HOUSE} Hammer Drill, 20V Kit`;

/** The delivery condition, as its account words it: a column of its own, the text the request's. */
const DELIVERY_TOMORROW = "delivery (read \"Delivery tomorrow\" on a row it kept) contains [\"Delivery tomorrow\"]";
/** The seller condition over the title, as its account words it: the value it read on a kept row is that row's name. */
export const SELLER_IS_TITLE = `seller (read "${DRILL_PRO.name}" on a row it kept) startsWith ["${HOUSE}"]`;
/** The seller condition over a real seller line. */
export const SELLER_LINE = `seller (read "Sold and shipped by ${HOUSE}" on a row it kept) contains ["${HOUSE}"]`;

/** The seller condition's account: three drills settled on what the read found. */
function sellerCondition(line: boolean): AutomationStudioResultReadCondition {
  const rows = [DRILL_TORVIK, DRILL_HALDEN, DRILL_ORMSBY];
  const values = line ? ["Sold by Torvik Outlet (marketplace)", "Sold by Halden Direct (marketplace)", "Sold by Ormsby Supply (marketplace)"] : rows;
  return {
    number: 3, condition: line ? SELLER_LINE : SELLER_IS_TITLE, rejected: 5, alone: 3, leftOutOnlyByThis: rows,
    leftOutObservations: values.map((value, at) => ({ source: "read" as const, page: at < 2 ? 1 : 2, item: at + 3, readKind: "text" as const, state: "present" as const, value })),
    leftOutSettled: rows,
    settled: "On each row in leftOutSettled the read found seller, as that row's witness in leftOutObservations gives it, and Core tested that value against condition 3 as written: each fails it."
  };
}

/** The run (header): `sellerLine` makes the seller column a real seller line, not the title. */
export function hardwareRunSummary(options: { sellerLine?: boolean } = {}): AutomationStudioRunResultSummary {
  const rows = [DRILL_PRO, DRILL_COMPACT];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: rows.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "drills", recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["name", "price", "rating"], columnsWithheld: false,
      rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: rows.map((row) => ({ ...row })),
      processing: { collected: 2, duplicates: 0, filteredOut: 0, cut: 0, kept: 2, passes: [{ node: DRILL_READ, pass: 1, rows: 1, newRows: 1 }, { node: DRILL_READ, pass: 2, rows: 1, newRows: 1 }] }
    }],
    reads: [{
      nodeId: DRILL_READ, definitionId: "extract_list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: 12, kept: 2, paginates: true,
      conditions: [
        {
          number: 1, condition: DELIVERY_TOMORROW, rejected: 2, alone: 1, leftOutOnlyByThis: [DRILL_SLOW],
          leftOutObservations: [{ source: "read", page: 2, item: 7, readKind: "text", state: "present", value: "Delivery in 6 days" }],
          leftOutSettled: [DRILL_SLOW],
          settled: "On each row in leftOutSettled the read found delivery, as that row's witness in leftOutObservations gives it, and Core tested that value against condition 1 as written: each fails it."
        },
        { number: 2, condition: "rating atLeast 4", rejected: 1, alone: 0 },
        sellerCondition(options.sellerLine === true)
      ]
    }],
    flowShape: [{ nodeId: "node.bootstrap.9a1c.find_drills.s2", definitionId: "type_text" }, { nodeId: DRILL_READ, definitionId: "extract_list" }],
    withheld: false
  };
}

/** The request as a Flow instruction. */
export function hardwareInstruction(body = HARDWARE_REQUEST): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/** The request text as the verification reads it (`../../verify.ts`). */
export function hardwareRequestText(body = HARDWARE_REQUEST): string {
  return `Goal\n${body}`;
}

/** The request as a judge's words are held to it, over a run. */
export function hardwareWording(summary = hardwareRunSummary(), body = HARDWARE_REQUEST): AutomationStudioRequestWording {
  return automationStudioRequestWording([hardwareInstruction(body)], summary)!;
}
