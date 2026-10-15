// A finished run with the shape of A8 wave 8's exact revisions (t631), on
// another kind of site: a park service's campsite search read over two pages,
// exactly the campsites asked for stored, and five conditions -- a promoted
// marker whose rows are also in the result, a text test of the request's own
// words that alone left out three campsites its read found saying otherwise, a
// rating bound, and two name conditions that left out no row by themselves --
// the first rejecting only rows another condition rejected too, the second
// none, so no row is left out by the two together.
// No task, site, item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import type { AutomationStudioResultReadCondition } from "../../read-condition.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../../request-rows/index.ts";

/** The request. */
export const CAMPSITE_REQUEST = "List every campsite in the park service's search results that is open this weekend and rated 4 or higher, going through every page. Leave out promoted entries, list each campsite once, with columns name, fee, rating and url.";

/** The steps: the search, a region filter, and the read. */
const CAMP_SEARCH = "node.trial.7c41e9a2.find_sites.s1";
export const CAMP_REGION = "node.trial.7c41e9a2.find_sites.s4";
export const CAMP_READ = "node.trial.7c41e9a2.find_sites.s9";

/** The four stored campsites: exactly the ones asked for. */
export const CAMP_CEDAR = { name: "Cedar Hollow Campground, Site 12", fee: "$24", rating: "4.6", url: "/sites/CH4R7T12" };
export const CAMP_BLUEWATER = { name: "Bluewater Campground, Loop B Site 4", fee: "$30", rating: "4.4", url: "/sites/BW8K2M04" };
const CAMP_PINE = { name: "Pine Ridge Campground, Walk-in Site 7", fee: "$18", rating: "4.8", url: "/sites/PR3N6Q07" };
const CAMP_GRANITE = { name: "Granite Falls Campground, Site 31", fee: "$22", rating: "4.1", url: "/sites/GF5W9X31" };

/** Left out by the availability condition alone, each read by Core with a value that fails the request's own words. */
export const CAMP_LARCH = "Larch Meadow Campground, Site 2";
export const CAMP_OSPREY = "Osprey Point Campground, Site 18";
export const CAMP_WILLOW = "Willow Bend Campground, Site 5";
/** Left out by the name condition alone, where asked: a campsite the request asks for, which Core did not settle. */
export const CAMP_SILVER = "Silver Lake Tent Sites, Site 6";

/** The availability condition, as its account words it: it reads its own value, and the text it tests is the request's. */
export const OPEN_THIS_WEEKEND = "availability (read \"Open this weekend\" on a row it kept) contains [\"Open this weekend\"]";
/** The name conditions, as their accounts word them. */
export const NAME_CONDITIONS = { campground: "name contains [\"Campground\"]", notCabin: "name not contains [\"Cabin\"]" } as const;

/** The availability condition's account. */
function availability(): AutomationStudioResultReadCondition {
  const rows = [CAMP_LARCH, CAMP_OSPREY, CAMP_WILLOW];
  return {
    number: 2, condition: OPEN_THIS_WEEKEND, rejected: 4, alone: 3, leftOutOnlyByThis: rows,
    leftOutObservations: [
      { source: "read", page: 1, item: 3, readKind: "text", state: "present", value: "Open next weekend" },
      { source: "read", page: 1, item: 9, readKind: "text", state: "present", value: "Closed for the season" },
      { source: "read", page: 2, item: 4, readKind: "text", state: "present", value: "Open next weekend" }
    ],
    leftOutSettled: rows,
    settled: "On each row in leftOutSettled the read found availability, as that row's witness in leftOutObservations gives it, and Core tested that value against condition 2 as written: each fails it."
  };
}

/**
 * The run (header): `nameDrops` makes the name condition leave out, alone, a
 * campsite the request asks for; `together` makes the second name condition
 * reject a row another condition rejected too -- a campsite whose name says
 * "Cabin" and not "Campground", open this weekend and rated 4.5, which the
 * request asks for and only the two name conditions left out together. No
 * account names that row; the counts show only that one may exist.
 */
export function campsiteRunSummary(options: { nameDrops?: boolean; together?: boolean } = {}): AutomationStudioRunResultSummary {
  const rows = [CAMP_CEDAR, CAMP_BLUEWATER, CAMP_PINE, CAMP_GRANITE];
  const promoted = [CAMP_CEDAR.name, CAMP_PINE.name];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: rows.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "campsites", recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["name", "fee", "rating", "url"], columnsWithheld: false,
      rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: rows.map((row) => ({ ...row })),
      processing: { collected: 4, duplicates: 0, filteredOut: 0, cut: 0, kept: 4, passes: [{ node: CAMP_READ, pass: 1, rows: 3, newRows: 3 }, { node: CAMP_READ, pass: 2, rows: 1, newRows: 1 }] }
    }],
    reads: [{
      nodeId: CAMP_READ, definitionId: "extract_list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: 14, kept: 4, paginates: true,
      conditions: [
        { number: 1, condition: "promoted is absent", rejected: 3, alone: 2, leftOutOnlyByThis: promoted, leftOutSettled: promoted },
        availability(),
        { number: 3, condition: "rating atLeast 4", rejected: 2, alone: 1, leftOutOnlyByThis: ["Juniper Wash Campground, Site 3 — rating: 3.7"], leftOutSettled: ["Juniper Wash Campground, Site 3 — rating: 3.7"] },
        options.nameDrops
          ? { number: 4, condition: NAME_CONDITIONS.campground, rejected: 3, alone: 1, leftOutOnlyByThis: [CAMP_SILVER], testedLabel: true }
          : { number: 4, condition: NAME_CONDITIONS.campground, rejected: 2, alone: 0 },
        { number: 5, condition: NAME_CONDITIONS.notCabin, rejected: options.together ? 1 : 0, alone: 0 }
      ]
    }],
    flowShape: [
      { nodeId: CAMP_SEARCH, definitionId: "type_text" },
      { nodeId: CAMP_REGION, definitionId: "click" },
      { nodeId: CAMP_READ, definitionId: "extract_list" }
    ],
    withheld: false
  };
}

/** The request as a Flow instruction, for the checks that read one; `body` another request. */
export function campsiteInstruction(body = CAMPSITE_REQUEST): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/** The request text as the verification reads it (`../../verify.ts`). */
export function campsiteRequestText(body = CAMPSITE_REQUEST): string {
  return `Goal\n${body}`;
}

/** The request as a judge's words are held to it, over a run. */
export function campsiteWording(summary = campsiteRunSummary(), body = CAMPSITE_REQUEST): AutomationStudioRequestWording {
  return automationStudioRequestWording([campsiteInstruction(body)], summary)!;
}
