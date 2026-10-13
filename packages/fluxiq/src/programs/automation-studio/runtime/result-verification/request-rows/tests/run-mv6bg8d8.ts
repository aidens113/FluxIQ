// Live run `run-mv6bg8d8-1a461436` (C round 14, build 1), in the shape its result
// judge (step 0064) and its trial judges (0047, 0048) were sent it: a list read
// whose own conditions never test the name, and a saved answer whose
// `process.where` -- name not contains "Ear Tips", name not contains "Charging
// Case" -- left out two accessories and three pairs of earbuds sold with a
// charging case. The account said `filteredOut: 5`, and four judges said yes.
//
// The stored set is made the way a run's end makes it: the collected rows go
// through `processAutomationStudioRecordRows`, and the summary through
// `summarizeAutomationStudioRunResult`. Row names are the run's; prices and
// links are stand-ins, as nothing here reads them but the processing.
import { processAutomationStudioRecordRows, type AutomationStudioRecordCollectedRow, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../contracts.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";

/** The read whose passes collected the set. */
export const RUN_MV6BG8D8_READ = "node.bootstrap.737cb74e.main.s9";

/** The three pairs the saved answer's `Charging Case` condition alone left out: the oracle's missing rows 8, 9 and 11. */
export const RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT = [
  "Lumo Audio Drift Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Touch Control, White",
  "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory with Wireless Charging Case",
  "Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case, Built-in Mic, Rose Gold"
];

/** The two accessories it rightly left out, one per condition. */
export const RUN_MV6BG8D8_ACCESSORIES = {
  earTips: "Replacement Ear Tips for Wireless Earbuds, Memory Foam Eartips, 3 Pairs (S/M/L), Black",
  case: "Charging Case Replacement for Soundcrest Air Pro Wireless Earbuds, 600mAh Charger Case with Pairing Button, White"
};

/** The ten rows the run stored. */
export const RUN_MV6BG8D8_STORED = [
  "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Ear Hooks for Running, IPX7 Waterproof, Rose Gold",
  "Brightaisle Basics Sport Wireless Earbuds, Bluetooth 5.3 with Ear Hooks, 36H Playtime, IPX7 Sweatproof, Black",
  "Zephyrline Z3 Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Deep Bass, Ear Hooks for Running, Sage",
  "Aurelle Echo Wireless Earbuds, Bluetooth 5.3 Headphones with 40H Playtime, Built-in Mic, Low Latency Gaming Mode, Ivory",
  "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory",
  "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, IPX7 Waterproof, Touch Control, Sage",
  "Aurelle Pods Wireless Earbuds, Bluetooth 5.3 Headphones with 40H Playtime, Low Latency Gaming Mode, Touch Control, Black",
  "Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Active Noise Cancelling, Built-in Mic, Ivory",
  "Aurelle Pods Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Deep Bass, Ear Hooks for Running, Black",
  "Soundcrest Air Pro 2 Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, LED Power Display, Built-in Mic, Graphite"
];

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "name", label: "Name", valueType: "string" },
    { id: "price", label: "Price", valueType: "string" },
    { id: "rating", label: "Rating", valueType: "string" },
    { id: "url", label: "Link", valueType: "url" }
  ]
};

/** The rev 5 saved answer's processing, as the Flow authored it. */
export const RUN_MV6BG8D8_PROCESS = {
  dedupe: { by: ["url"] },
  where: [{ field: "name", contains: "Ear Tips", not: true }, { field: "name", contains: "Charging Case", not: true }]
};

/** The read's own account: every condition tests a column other than the name, and none of its rows is the label's own test. */
const READ: AutomationStudioResultReadAccount = {
  nodeId: RUN_MV6BG8D8_READ,
  definitionId: "web.output.dom-extract_list",
  pagesRead: 5,
  truncated: false,
  stop: "ended",
  itemsSeen: 94,
  kept: 17,
  conditions: [
    { condition: "ad is absent", rejected: 9, alone: 2, leftOutOnlyByThis: ["Pulsebud Neo ANC Wireless Earbuds, Hybrid Active Noise Cancelling Bluetooth 5.4 Headphones, 50H Playtime, App EQ, Black — ad: Sponsored"] },
    { condition: "plus is present", rejected: 37, alone: 8, leftOutOnlyByThis: ["Soundcrest Air Pro 2 Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Active Noise Cancelling, Ivory — plus: (no value)"] },
    { condition: "rating atLeast 4", rejected: 30, alone: 6, leftOutOnlyByThis: ["Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Deep Bass, Built-in Mic, Midnight Blue — rating: 3.8"] },
    { condition: "price lessThan 50", rejected: 20, alone: 3, leftOutOnlyByThis: ["Soundcrest Sport X Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Active Noise Cancelling, Ear Hooks for Running, White — price: $89.99"] }
  ]
};

function collected(): AutomationStudioRecordCollectedRow[] {
  const row = (name: string, batch: string, at: number): AutomationStudioRecordCollectedRow => ({
    values: { name, price: "$29.99", rating: "4.2", url: `/dp/item-${name.length}-${at}` }, nodeId: RUN_MV6BG8D8_READ, batchKey: batch
  });
  const names = [...RUN_MV6BG8D8_STORED.slice(0, 4), RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT[0]!, RUN_MV6BG8D8_ACCESSORIES.earTips, ...RUN_MV6BG8D8_STORED.slice(4, 7),
    RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT[1]!, RUN_MV6BG8D8_ACCESSORIES.case, ...RUN_MV6BG8D8_STORED.slice(7), RUN_MV6BG8D8_EARBUDS_PROCESSED_OUT[2]!];
  const rows = names.map((name, at) => row(name, `b${Math.floor(at / 4) + 1}`, at));
  // Two page-boundary repeats, as the run collected them.
  return [...rows.slice(0, 4), { ...rows[3]!, batchKey: "b2" }, ...rows.slice(4, 8), { ...rows[7]!, batchKey: "b3" }, ...rows.slice(8)];
}

/** The final run's summary, as its result judge was sent it (0064), made through the run end's own function. */
export function runMv6bg8d8RunSummary(): AutomationStudioRunResultSummary {
  const made = processAutomationStudioRecordRows({ rows: collected(), schema: SCHEMA, process: RUN_MV6BG8D8_PROCESS, now: 0 });
  const summary = summarizeAutomationStudioRunResult({
    recordSets: [{
      summary: { runId: "run-mv6bg8d8", datasetId: "brightaisle-plus-earbuds", nodeIds: [RUN_MV6BG8D8_READ], schemaDigest: "digest", recordCount: made.account.kept, truncated: false, invalidCount: 0, updatedAt: 0, processing: made.account },
      schema: SCHEMA,
      rows: made.rows.map((row): JsonObject => Object.fromEntries(Object.entries(row).filter((cell): cell is [string, string] => typeof cell[1] === "string")))
    }],
    deniedEvidenceKeys: []
  });
  return { ...summary, reads: [structuredClone(READ)] };
}
