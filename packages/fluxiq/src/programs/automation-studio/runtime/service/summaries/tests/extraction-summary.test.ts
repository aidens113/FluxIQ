// A list read's own account of itself, from the dispatched result to the run
// detail a finished run is read from.
//
// The point of these tests is the distinction the run record could not make
// before. An attempt that stored no rows carried `metadata.recordCount` and
// nothing else, so a read whose selector named nothing, a read of a page that
// held nothing, and a read whose `where` rejected every row were the same
// record. Each wants a different repair.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { defineOutput, IoRegistry } from "../../../../../../io/index.ts";
import { RuntimeService } from "../../../../../../runtime/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../../executor.ts";
import { createRuntimePolicyEffectDispatcher } from "../../../io-policy.ts";
import { runtimeSessionToFlowRunDetail } from "../../index.ts";
import { extractionSummaryFromOutputs } from "../extraction-summary.ts";

const READ = { recordCount: 8, pagesRead: 1, truncated: false, fieldNames: ["name", "price"], missingFields: [] };

/**
 * The 2026-09-25 regression's own shape, as the read now states it: a wait that
 * gave up on a still page after ~2 s. t143 had to reconstruct exactly this by
 * arithmetic on `durationMs` across fourteen attempts, because nothing published
 * what a read waited for or why it stopped.
 */
const WAIT = { stoppedOn: "page_settled", waitedMs: 2089, waitedFor: 1 };

describe("a list read's summary on a saved attempt", () => {
  it("reaches the run detail, so a read that found rows says how many over how many pages", async () => {
    const detail = await runDetailFor({
      commandId: "command.runtime",
      actionType: "web.dom.extract_list",
      status: "succeeded",
      extraction: { ...READ, listPresence: "appeared", missingFields: ["price"] }
    });

    expect(detail.actionAttempts?.[0]?.metadata?.extraction).toEqual({
      recordCount: 8,
      pagesRead: 1,
      truncated: false,
      fieldNames: ["name", "price"],
      missingFields: ["price"],
      listPresence: "appeared"
    });
  });

  it("says a list never appeared, which no count on the attempt could have said", async () => {
    const detail = await runDetailFor({
      commandId: "command.runtime",
      actionType: "web.dom.extract_list",
      status: "succeeded",
      extraction: { ...READ, recordCount: 0, listPresence: "never_appeared" }
    });

    expect(detail.actionAttempts?.[0]?.metadata?.extraction).toMatchObject({ recordCount: 0, listPresence: "never_appeared" });
  });

  // The three members t143's diagnosis needed and had to time by hand instead.
  // A zero read that reaches the run detail with these on it says which of four
  // things happened without anyone comparing durations: the selector named
  // nothing (`itemsSeen: 0`), the fields were read off the wrong element
  // (`emptyRecords` equal to `recordCount`), or the wait gave up on a still page
  // (`stoppedOn: "page_settled"`).
  it("carries what the read waited for, why the wait stopped, how many items it saw and how many came back empty", async () => {
    const detail = await runDetailFor({
      commandId: "command.runtime",
      actionType: "web.dom.extract_list",
      status: "succeeded",
      extraction: { ...READ, recordCount: 0, itemsSeen: 0, emptyRecords: 0, listPresence: "never_appeared", listWait: WAIT }
    });

    expect(detail.actionAttempts?.[0]?.metadata?.extraction).toEqual({
      recordCount: 0,
      pagesRead: 1,
      truncated: false,
      fieldNames: ["name", "price"],
      missingFields: [],
      itemsSeen: 0,
      emptyRecords: 0,
      listPresence: "never_appeared",
      listWait: { stoppedOn: "page_settled", waitedMs: 2089, waitedFor: 1 }
    });
  });

  // Live run `run-mulwm2dc-0bd95f22` asked for fifty pages, read one, and its
  // run record said `pagesRead: 1, truncated: false` and nothing about why. The
  // page had ignored its Next; a Next that named nothing would have looked
  // identical, and the two are different repairs.
  it("carries why a paginated read stopped paging", async () => {
    const detail = await runDetailFor({
      commandId: "command.runtime",
      actionType: "web.dom.extract_list",
      status: "succeeded",
      extraction: { ...READ, recordCount: 12, paginationStop: "list_unchanged" }
    });

    expect(detail.actionAttempts?.[0]?.metadata?.extraction).toEqual({ ...READ, recordCount: 12, paginationStop: "list_unchanged" });
  });

  it("carries nothing for an attempt whose host reported no summary, rather than an empty record", async () => {
    const detail = await runDetailFor({ commandId: "command.runtime", status: "succeeded", url: "https://example.test/" });

    expect(detail.actionAttempts?.[0]?.metadata).not.toHaveProperty("extraction");
  });
});

describe("what the projection admits", () => {
  // The payload arrives from a downstream host and is parsed, not typed, so
  // each of these is a value that could arrive and must not be republished.
  it("keeps the condition report's counts, which is how a read that rejected every row is told from an empty page", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, recordCount: 30, conditions: { applied: 30, kept: 0, rejected: [30, 2], unfiltered: true } } } }))
      .toEqual({ recordCount: 30, pagesRead: 1, truncated: false, fieldNames: ["name", "price"], missingFields: [], conditions: { applied: 30, kept: 0, rejected: [30, 2], unfiltered: true } });
  });

  it("refuses a presence word this Core does not know, so a word the domain adds stays behind until it is named", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, listPresence: "perhaps" } } })).toBeUndefined();
  });

  it("keeps all four stop words, and the two counts a zero read is diagnosed by", () => {
    for (const stoppedOn of ["list_present", "page_settled", "window_elapsed", "deadline_passed"]) {
      expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, listWait: { ...WAIT, stoppedOn } } } }))
        .toEqual({ ...READ, listWait: { stoppedOn, waitedMs: 2089, waitedFor: 1 } });
    }
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, itemsSeen: 12, emptyRecords: 4 } } }))
      .toEqual({ ...READ, itemsSeen: 12, emptyRecords: 4 });
    // `itemsSeen: 0` beside records is not cross-checked away: the pairings that
    // look wrong are the diagnosis, and refusing them costs the account.
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, itemsSeen: 0, emptyRecords: 8 } } }))
      .toEqual({ ...READ, itemsSeen: 0, emptyRecords: 8 });
  });

  // Unlike the presence word above, and for the reason the module header gives:
  // a fifth mechanism for ending a wait is a thing the domain can ship first,
  // and refusing it would cost every read in every run the account t143 had to
  // rebuild from durations.
  it("renames a stop word it does not know rather than dropping the read that reported it", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, listWait: { ...WAIT, stoppedOn: "items_stopped_growing" } } } }))
      .toEqual({ ...READ, listWait: { stoppedOn: "unknown", waitedMs: 2089, waitedFor: 1 } });
  });

  it("keeps every pagination stop word, and renames one it does not know rather than dropping the read", () => {
    const words = ["control_absent", "control_disabled", "no_following_page", "scrolled_to_end", "list_vanished", "page_limit", "item_limit", "deadline", "rate_limited", "list_unchanged", "page_repeated", "control_not_clickable", "page_fault"];
    for (const paginationStop of words) {
      expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, paginationStop } } })).toEqual({ ...READ, paginationStop });
    }
    const projected = extractionSummaryFromOutputs({ result: { extraction: { ...READ, paginationStop: "#next-button was hidden" } } });
    expect(projected).toEqual({ ...READ, paginationStop: "unknown" });
    expect(JSON.stringify(projected)).not.toContain("#next-button");
  });

  it("refuses a pagination stop that is not even a word", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, paginationStop: 3 } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, paginationStop: null } } })).toBeUndefined();
  });

  it("publishes the unknown word rather than the one the producer sent, so nothing unredacted rides out on it", () => {
    const projected = extractionSummaryFromOutputs({ result: { extraction: { ...READ, listWait: { ...WAIT, stoppedOn: "#private-selector had 0 items" } } } });
    expect(projected?.listWait).toEqual({ stoppedOn: "unknown", waitedMs: 2089, waitedFor: 1 });
    expect(JSON.stringify(projected)).not.toContain("#private-selector");
  });

  // Absence of `listWait` means one thing -- this read waited for no list of its
  // own -- so an account that is malformed rather than merely newer must not
  // quietly become that.
  it("refuses an account whose durations are not counts, or whose stop is not even a word", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, listWait: { ...WAIT, waitedMs: "2089" } } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, listWait: { ...WAIT, waitedFor: -1 } } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, listWait: { ...WAIT, stoppedOn: 4 } } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, listWait: "page_settled after 2089ms" } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, itemsSeen: "twelve" } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, emptyRecords: -1 } } })).toBeUndefined();
  });

  it("refuses a count that is not a count", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, recordCount: "eight" } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, pagesRead: -1 } } })).toBeUndefined();
  });

  it("refuses a field key that could carry page text, and a missing field the read never declared", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, fieldNames: ["Ships in 2 days"] } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, missingFields: ["discount"] } } })).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, fieldNames: ["__proto__"] } } })).toBeUndefined();
  });

  it("copies what each condition's own read found, whole, and refuses a malformed list", () => {
    const counts = { applied: 30, kept: 4, rejected: [26, 2], unfiltered: false };
    const admitted = (seen: unknown) => extractionSummaryFromOutputs({ result: { extraction: { ...READ, conditions: { ...counts, seen } } } });
    expect(admitted(["Brightaisle Plus", null])?.conditions).toEqual({ ...counts, seen: ["Brightaisle Plus", null] });
    // No character cut (user, 2026-09-30).
    expect(admitted(["x".repeat(5_000), null])?.conditions).toEqual({ ...counts, seen: ["x".repeat(5_000), null] });
    // Absent is a producer that predates it, and the report still arrives.
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, conditions: counts } } })?.conditions).toEqual(counts);
    for (const malformed of [["Brightaisle Plus"], ["Brightaisle Plus", 3], [{ label: "Plus" }, null], "Brightaisle Plus", null]) {
      expect(admitted(malformed), JSON.stringify(malformed)).toBeUndefined();
    }
  });

  it("carries per condition how many rows it removed alone, from a playback's own counts, and refuses a malformed list", () => {
    // run-mup2u8o3-6697c4be: the accessory rule rejected 20 rows and removed 5 by itself.
    const counts = { applied: 40, kept: 10, rejected: [12, 6, 3, 20], unfiltered: false };
    const admitted = (alone: unknown) => extractionSummaryFromOutputs({ result: { extraction: { ...READ, conditions: { ...counts, alone } } } });
    expect(admitted([4, 1, 0, 5])?.conditions).toEqual({ ...counts, alone: [4, 1, 0, 5] });
    // Counts only: no row text rides on it.
    expect(JSON.stringify(admitted([4, 1, 0, 5]))).not.toContain("Earbuds");
    // Absent is a producer that predates it, and the report still arrives without it.
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, conditions: counts } } })?.conditions).toEqual(counts);
    // One count per condition, never above that condition's own rejections.
    for (const malformed of [[4, 1, 0], [4, 1, 0, 21], [4, 1, 0, -1], [4, 1, 0, "5"], "5", null]) {
      expect(admitted(malformed), JSON.stringify(malformed)).toBeUndefined();
    }
  });

  // Live run 15 (run-muqj2bgb-d048ec37): a playback asks for the rows each condition removed by itself
  // ("alone"), and the accessory rule's were three true earbuds sold "with Wireless Charging Case".
  it("keeps the label of every row a condition removed by itself, and no other row, and refuses malformed rows", () => {
    const fields = { ...READ, fieldNames: ["url", "name", "price"] };
    const counts = { applied: 40, kept: 10, rejected: [12, 20], unfiltered: false, alone: [0, 3] };
    const earbud = { url: "/dp/B01", name: "Lumo Audio Drift Pro Wireless Earbuds, Wireless Charging Case, White", price: "$39.99" };
    const trevio = { url: "/dp/B02", name: "  Trevio T5 Wireless Earbuds, Wireless Charging Case, Rose Gold ", price: "$29.99" };
    const priceOnly = { url: null, name: null, price: "$12.00" };
    const alsoFailedPrice = { url: "/dp/B03", name: "Charging Case Replacement", price: "$80.00" };
    const admitted = (rejectedSamples: unknown, rejectedSamplesAlone: unknown) =>
      extractionSummaryFromOutputs({ result: { extraction: { ...fields, conditions: counts, rejectedSamples, rejectedSamplesAlone } } });
    // A playback's form: each list is its alone rows. The label is the first text column, whole; an address is not text.
    // The rest of the row follows the label (t195-w34): the read account says the label with the value its condition tested.
    const played = admitted([[], [earbud, trevio, priceOnly]], [0, 3])?.conditions as { aloneRows: Array<Array<Record<string, string>>> };
    expect(played).toEqual({
      ...counts,
      aloneRows: [[], [
        { name: earbud.name, url: "/dp/B01", price: "$39.99" },
        { name: "Trevio T5 Wireless Earbuds, Wireless Charging Case, Rose Gold", url: "/dp/B02", price: "$29.99" },
        { price: "$12.00", url: "", name: "" }
      ]]
    });
    // The label is the first cell, whatever the field order.
    expect(played.aloneRows[1]!.map((row) => Object.keys(row)[0])).toEqual(["name", "name", "price"]);
    // The exploring form: every rejected row, the alone ones leading. Only the lead is kept.
    expect(admitted([[], [earbud, alsoFailedPrice]], [0, 1])?.conditions).toMatchObject({ aloneRows: [[], [{ name: earbud.name, url: "/dp/B01", price: "$39.99" }]] });
    expect(JSON.stringify(admitted([[], [earbud, alsoFailedPrice]], [0, 1]))).not.toContain("Replacement");
    // Rows with no leads, from a page build that did not order them, say nothing of which were alone, and are not kept.
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...fields, conditions: counts, rejectedSamples: [[], [earbud]] } } })?.conditions).toEqual(counts);
    // Not one list per condition, a lead past its list, a column the read does not declare, a cell that is not text.
    for (const [rows, leads] of [[[[earbud]], [1]], [[[], [earbud]], [0, 2]], [[[], [{ ...earbud, seller: "x" }]], [0, 1]], [[[], [{ ...earbud, price: 39.99 }]], [0, 1]], [[[], [earbud]], "1"]]) {
      expect(admitted(rows, leads), JSON.stringify([rows, leads])).toBeUndefined();
    }
  });

  it("refuses a condition report that kept more than it looked at, and admits any number of conditions", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, conditions: { applied: 2, kept: 3, rejected: [], unfiltered: false } } } })).toBeUndefined();
    // No count cap: a read of two hundred conditions reports all two hundred (user, 2026-09-30).
    const many = Array.from({ length: 200 }, (_unused, index) => index);
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, conditions: { applied: 2, kept: 1, rejected: many, unfiltered: false } } } })?.conditions).toMatchObject({ rejected: many });
  });

  it("carries nothing extra the host put beside the members it knows", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, itemSelector: ".product-card" } } })).toEqual(READ);
  });

  it("finds the summary one level further in, where the gateway dispatcher's own wrapper puts it", () => {
    // The route a paired browser client's read actually takes: the domain's
    // gateway output dispatcher answers `{ status, message, result }`.
    expect(extractionSummaryFromOutputs({ result: { status: "succeeded", message: "List extracted.", result: { extraction: READ } } })).toEqual(READ);
  });

  it("carries nothing for an attempt that dispatched nothing, or whose result payload was withheld", () => {
    expect(extractionSummaryFromOutputs({})).toBeUndefined();
    expect(extractionSummaryFromOutputs({ result: "[withheld]" })).toBeUndefined();
    expect(extractionSummaryFromOutputs(undefined)).toBeUndefined();
  });
});

/** One dispatched action whose host answered with `payload`, as the run detail states it. */
async function runDetailFor(payload: JsonObject) {
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1",
    flowId: "flow.extraction-summary",
    ownerKind: "task",
    ownerId: "task.extraction-summary",
    name: "Extraction summary",
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "read-list", parameters: { item: "card" } } }],
    edges: []
  };
  const io = new IoRegistry();
  io.registerOutput("example", defineOutput({
    definition: { id: "read-list", title: "Read list" },
    mode: "request",
    dispatch: (request) => ({ ok: true, outputId: request.outputId })
  }));
  const runtime = new RuntimeService();
  runtime.registerAdapter({
    adapterId: "example.runtime",
    label: "Example Runtime",
    transport: "direct",
    domainId: "example",
    capabilities: () => [{ id: "example.outputs", kind: "action", domainId: "example", outputIds: ["read-list"] }],
    execute: (command) => ({ commandId: command.commandId ?? "command.runtime", status: "succeeded", payload })
  });
  const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createRuntimePolicyEffectDispatcher(io, "example", runtime) });
  const session: AutomationStudioRuntimeSession = { schemaVersion: "0.1", runId: "run.extraction-summary", projectId: "project.extraction", targetKind: "flow", targetId: flow.flowId, flowId: flow.flowId, status: "succeeded", queuedAt: 1, flow, trace };
  return runtimeSessionToFlowRunDetail(session, "project.extraction");
}

// Live run `run-muqk713g`: 12 rows passed every condition and 10 were stored,
// the other two repeats of an earlier page that nothing on the record named.
describe("the rows a page-by-page read left out as repeats of an earlier page", () => {
  it("travel as a count, and are absent from a read that did not send one", () => {
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, earlierPageRepeats: 2 } } })).toEqual({ ...READ, earlierPageRepeats: 2 });
    expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, earlierPageRepeats: 0 } } })).toEqual({ ...READ, earlierPageRepeats: 0 });
    expect(extractionSummaryFromOutputs({ result: { extraction: READ } })).not.toHaveProperty("earlierPageRepeats");
  });

  it("drop the whole summary when the count is not a count", () => {
    for (const value of [-1, 1.5, "2", null]) {
      expect(extractionSummaryFromOutputs({ result: { extraction: { ...READ, earlierPageRepeats: value } } }), JSON.stringify(value)).toBeUndefined();
    }
  });
});
