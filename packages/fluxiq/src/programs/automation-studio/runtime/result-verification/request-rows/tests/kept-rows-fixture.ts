// Two generic finished runs for the checks on the rows a result keeps (t663),
// on other kinds of site with the shape of A8 towels `run-mvahlxuu-760d9e28`:
// a list of the item asked for, and one kept row that is something else that
// shares the search words -- in a library, a bookmark set among atlases, stored
// without the page count every atlas carries; in a hardware store, an
// organizer case among packs of wood screws, its name writing "Wood Screw"
// where every pack writes "Wood Screws".
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../request-wording.ts";

/** The library's request: one kind of book, three columns. */
export const ATLAS_REQUEST = "Collect every hardcover atlas in the catalogue with its title, pages and isbn.";

/** The atlases the read kept, each with all three columns. */
export const ATLASES = [
  "Harbor Press World Atlas, 2026 Edition",
  "Meridian Road Atlas of the Americas",
  "Northwind Historical Atlas, Revised",
  "Cobalt Ocean Atlas, Large Print",
  "Fernway Star Atlas for Beginners",
  "Granite Atlas of Mountain Ranges",
  "Lantern Atlas of Ancient Cities",
  "Saltmarsh Coastal Atlas, Volume 2",
  "Tidewell Atlas of River Systems"
];

/** The kept row that is not an atlas, stored without pages. */
export const BOOKMARK = "Atlas Bookmark Set, Brass, 3 Pieces";

/** An atlas row with every column. */
export function atlasRow(title: string, index: number): JsonObject {
  return { title, pages: String(180 + index * 12), isbn: `97815${String(1000000 + index)}`, url: `https://library.example/item/${index}` };
}

/** The library run: the rows given stored in one set, its record output's answer columns stated where `answerColumns` is given. */
export function atlasRunSummary(rows: JsonObject[], answerColumns?: string[]): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: rows.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "atlases", recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["title", "pages", "isbn", "url"], columnsWithheld: false,
      rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: rows
    }],
    flowShape: [
      { nodeId: "search", definitionId: "type_text" },
      {
        nodeId: "read", definitionId: "extract_list",
        ...(answerColumns ? { parameters: { recordOutput: { datasetId: "atlases", process: { columns: answerColumns } } } } : {})
      }
    ],
    withheld: false
  };
}

/** The library run of the debug's shape: nine atlases and the bookmark set without pages. */
export function atlasWithBookmarkSummary(answerColumns: string[] | undefined = ["title", "pages", "isbn"]): AutomationStudioRunResultSummary {
  const { pages: _pages, ...bookmark } = atlasRow(BOOKMARK, 9);
  return atlasRunSummary([...ATLASES.map(atlasRow), bookmark], answerColumns);
}

/** The library request as a judge's words are held to it. */
export function atlasWording(summary: AutomationStudioRunResultSummary): AutomationStudioRequestWording {
  return automationStudioRequestWording([{ title: "Collect the atlases", body: ATLAS_REQUEST }], summary)!;
}

/** The hardware store's request. */
export const SCREW_REQUEST = "Collect every pack of wood screws from the fastener aisle with its name and price.";

/** Packs of wood screws, each name writing "Wood Screws". */
export const SCREW_PACKS = [
  "Ironleaf Wood Screws, #8 x 1-1/4 in, 100 Pack",
  "Ironleaf Wood Screws, #10 x 2 in, 50 Pack",
  "Bramblecore Wood Screws, Coarse Thread, 200 Pack",
  "Bramblecore Wood Screws, Fine Thread, 150 Pack",
  "Kestrel Deck Wood Screws, Coated, 75 Pack",
  "Kestrel Wood Screws, Square Drive, 120 Pack",
  "Oakhollow Wood Screws, Brass, 40 Pack",
  "Oakhollow Wood Screws, Stainless, 60 Pack",
  "Pinecrest Wood Screws, Assorted Sizes, 300 Pack"
];

/** The kept row that is not a pack of screws: its name writes "Wood Screw". */
export const ORGANIZER = "Ironleaf Wood Screw Organizer Case, 24 Compartments";

/** The hardware run: the names given stored with a price, read by one read with no condition. */
export function screwRunSummary(names: readonly string[]): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: names.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "screws", recordCount: names.length, refusedCount: 0, truncated: false, columns: ["name", "price"], columnsWithheld: false,
      rowsChecked: names.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: names.map((name, index) => ({ name, price: `$${(6 + index).toFixed(2)}` }))
    }],
    reads: [{ nodeId: "read", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: names.length, kept: names.length, conditions: [] }],
    flowShape: [{ nodeId: "aisle", definitionId: "navigate" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** The hardware request as a judge's words are held to it. */
export function screwWording(summary: AutomationStudioRunResultSummary): AutomationStudioRequestWording {
  return automationStudioRequestWording([{ title: "Collect the wood screws", body: SCREW_REQUEST }], summary)!;
}
