// A yes over a row a condition alone left out quotes the request's own words
// that exclude it (t515, live run `run-mv6v2hx5-f448e662`): both build-test
// judges named a row the request never excludes and gave a reason of their own,
// and the named-rows guard, which asks only that a row be named, took both.
import { describe, expect, it } from "vitest";
import { automationStudioRequestWording } from "../request-wording.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultKeptEveryRowFlagged, automationStudioResultLeftOutRowsUnquoted } from "../unquoted-rows.ts";
import { RENEWALS_KEPT, RENEWALS_LEFT_OUT, RENEWALS_LIST_READ, RENEWALS_ACT_READ, RENEWALS_REQUEST_EVERY_LOAN, RENEWALS_YES, renewalsInstructions, renewalsRunSummary } from "./renewals-fixture.ts";
import {
  REQUEST_WORDS_NAMES, REQUEST_WORDS_HANDLE, REQUEST_WORDS_OUT_OF_STOCK, REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS,
  requestWordsRunSummary, requestWordsWording
} from "./request-words-fixture.ts";

const unquoted = (reply: string, wording = requestWordsWording()) => automationStudioResultLeftOutRowsUnquoted(requestWordsRunSummary(), reply, wording);

const STOCK_SAID = `Copper Garden Tools Pair is left out, as the request says "leaving out out-of-stock items".`;

describe("rows a condition alone left out, held to the request's own words", () => {
  it("refuses a quote of the words the request searched by, beside the row", () => {
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is left out, because the request asks for "garden tools".`)).toEqual([
      { nodeId: "read", condition: REQUEST_WORDS_NAMES.handle, rows: [REQUEST_WORDS_HANDLE] }
    ]);
  });

  it("refuses a reason in the judge's own words", () => {
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is a spare part, not a tool, so it is rightly left out.`)).toEqual([
      { nodeId: "read", condition: REQUEST_WORDS_NAMES.handle, rows: [REQUEST_WORDS_HANDLE] }
    ]);
  });

  it("refuses a quote the request never says", () => {
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is left out: the request wants "complete tools only".`)).toHaveLength(1);
  });

  it("refuses a quote of the request's words that are only where it looked", () => {
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is left out: "collect every result on the first page".`)).toHaveLength(1);
  });

  // t574: judges often quote the request in the sentence beside the one naming the rows. A sentence that
  // names no row lends its quote to the sentence either side of it; never further, and never a quote beside
  // another row (the two tests above: STOCK_SAID names its own row, so its quote is that row's alone).
  it("takes a quote in the sentence beside the rows, when that sentence names no row of its own", () => {
    expect(unquoted(`Copper Garden Tools Pair and Replacement Handle for Garden Tools are left out. The request says "leaving out out-of-stock items".`)).toEqual([]);
    expect(unquoted(`The request says "leaving out out-of-stock items". Copper Garden Tools Pair and Replacement Handle for Garden Tools are left out.`)).toEqual([]);
  });

  it("refuses a quote two sentences from the rows, or on another line", () => {
    const apart = [
      `Copper Garden Tools Pair and Replacement Handle for Garden Tools are left out. Every kept row is a garden tool. The request says "leaving out out-of-stock items".`,
      `Copper Garden Tools Pair and Replacement Handle for Garden Tools are left out.
The request says "leaving out out-of-stock items".`
    ];
    for (const reply of apart) {
      expect(unquoted(reply), reply).toEqual([
        { nodeId: "read", condition: REQUEST_WORDS_NAMES.stock, rows: [REQUEST_WORDS_OUT_OF_STOCK] },
        { nodeId: "read", condition: REQUEST_WORDS_NAMES.handle, rows: [REQUEST_WORDS_HANDLE] }
      ]);
    }
  });

  // t570's offline replay of live run `run-mv7vmvhd-b0c18c5a` (step 0072): an empty `""` in the reply opened a
  // quotation that closed at the next mark, every later quotation was read inside out, and a yes that quoted the
  // request beside its rows was held. With the `""` removed it passed; an empty pair is now a quotation of nothing.
  it("pairs quotes as written when the reply holds an empty pair", () => {
    const wording = requestWordsWording(REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS);
    const reply = `Copper Garden Tools Pair (stock: "" -- none shown) is left out, as the request says "leaving out out-of-stock items". Replacement Handle for Garden Tools is left out by the request's "replacement parts".`;
    expect(unquoted(reply, wording)).toEqual([]);
    // The same reply with the empty pair taken out reads the same.
    expect(unquoted(reply.replace(' "" ', " "), wording)).toEqual([]);
  });

  it("never ends a sentence inside a quotation", () => {
    const wording = requestWordsWording(REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS);
    // The judge's own quotation holds a full stop and a capital; the request's quote after it is still in the row's sentence.
    expect(unquoted(`Copper Garden Tools Pair reads "Out of stock. Notify me" and is left out by "leaving out out-of-stock items". Replacement Handle for Garden Tools is left out by "replacement parts".`, wording)).toEqual([]);
  });

  it("refuses a row the reply never names, whatever it quotes", () => {
    expect(unquoted(`Every left-out row is excluded by "leaving out out-of-stock items".`)).toHaveLength(2);
  });

  it("takes each row named beside a quote of the request's own excluding words, in any quotation marks", () => {
    const wording = requestWordsWording(REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS);
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is left out by the request's ‘replacement parts’.`, wording)).toEqual([]);
    expect(unquoted(`Copper Garden Tools Pair: “leaving out out-of-stock items”.\nReplacement Handle for Garden Tools: 'leaving out out-of-stock items and replacement parts'.`, wording)).toEqual([]);
  });

  it("holds no words to a request that says nothing", () => {
    expect(automationStudioRequestWording([], requestWordsRunSummary())).toBeUndefined();
    expect(automationStudioRequestWording([{ title: "", body: "  " }], requestWordsRunSummary())).toBeUndefined();
  });
});

// Every row a read stored that kept every item it saw after an act over a
// narrower read of the same list (t692): a kept row Core flagged, named beside
// that read with the request's words, whether or not the record set says its
// collecting passes. The loans of `./renewals-fixture.ts` (A8
// `run-mvbr0w7e-6a01c05b`'s shape): with no passes, t691's stored-row rule has
// no read to hold the four unrenewed loans to, and judge 0032's yes -- which
// lists every loan beside the bound's quote and says the last read "holds all
// 8 rows" -- was taken though both calls, the second the converse, said yes.
describe("every row a flagged read stored (t692)", () => {
  const TITLES = [...RENEWALS_LEFT_OUT, ...RENEWALS_KEPT].map(([title]) => title);
  /** The fixture's summary with the last read flagged, storing the renewed-loans set, and no set saying its passes. */
  const flagged = (): AutomationStudioRunResultSummary => {
    const summary = renewalsRunSummary();
    for (const set of summary.recordSets) delete set.processing;
    const last = summary.reads!.find((read) => read.nodeId === RENEWALS_LIST_READ)!;
    last.keptEveryRow = { narrowerRead: RENEWALS_ACT_READ, narrowerSeen: 8, narrowerKept: 4, actedBy: ["node.loans.renew_overdue.s11"], sameList: "items_edge_and_read_target", said: "Core's flag.", storedIn: ["renewed-loans-s14"] };
    return summary;
  };
  const judged = async (summary: AutomationStudioRunResultSummary, observed: string, request?: string) => {
    let calls = 0;
    const provider = mockProvider(async () => {
      calls += 1;
      return judgeReply("yes", { expected: RENEWALS_YES.diagnosis.expected, observed });
    });
    const verdict = await automationStudioBuildTestJudge({ provider, instructions: renewalsInstructions(request), deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1" })({ summary });
    return { verdict, calls };
  };

  it("are each a kept row Core flagged, from the sets the read stored, with no passes in reach", () => {
    expect(automationStudioResultKeptEveryRowFlagged(flagged())).toEqual([
      { kind: "every_row", datasetId: "renewed-loans-s14", nodeId: RENEWALS_LIST_READ, missing: RENEWALS_ACT_READ, rows: expect.arrayContaining(TITLES), of: 8, pool: expect.arrayContaining(TITLES) }
    ]);
    expect(automationStudioResultKeptEveryRowFlagged(renewalsRunSummary())).toEqual([]);
  });

  it("hold a converse-confirmed yes that never names them beside that read: it is not taken", async () => {
    const { verdict, calls } = await judged(flagged(), RENEWALS_YES.diagnosis.observed);
    // Both calls said yes, the second the converse; Core then held it and asked again for the rows it lacked, which no answer gave.
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(verdict.verdict).toBe("not_judged");
    // Without the flag, the same two yeses over the same passless summary were taken (the gap t692 closes).
    const unflagged = flagged();
    delete unflagged.reads!.find((read) => read.nodeId === RENEWALS_LIST_READ)!.keptEveryRow;
    expect((await judged(unflagged, RENEWALS_YES.diagnosis.observed)).verdict.verdict).toBe("yes");
  });

  it("take a yes that names each beside that read with the request's words asking for it", async () => {
    const observed = `${RENEWALS_YES.diagnosis.observed} s14 stores ${TITLES.join(", ")} because the request asks for "every loan on the list, renewed or not".`;
    expect((await judged(flagged(), observed, RENEWALS_REQUEST_EVERY_LOAN)).verdict).toMatchObject({ verdict: "yes", firstAskConfirmed: true });
  });
});
