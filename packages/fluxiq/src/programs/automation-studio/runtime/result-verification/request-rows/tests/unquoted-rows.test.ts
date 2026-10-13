// A yes over a row a condition alone left out quotes the request's own words
// that exclude it (t515, live run `run-mv6v2hx5-f448e662`): both build-test
// judges named a row the request never excludes and gave a reason of their own,
// and the named-rows guard, which asks only that a row be named, took both.
import { describe, expect, it } from "vitest";
import { automationStudioRequestWording } from "../request-wording.ts";
import { automationStudioResultLeftOutRowsUnquoted } from "../unquoted-rows.ts";
import {
  REQUEST_WORDS_CONDITIONS, REQUEST_WORDS_HANDLE, REQUEST_WORDS_OUT_OF_STOCK, REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS,
  requestWordsRunSummary, requestWordsWording
} from "./request-words-fixture.ts";

const unquoted = (reply: string, wording = requestWordsWording()) => automationStudioResultLeftOutRowsUnquoted(requestWordsRunSummary(), reply, wording);

const STOCK_SAID = `Copper Garden Tools Pair is left out, as the request says "leaving out out-of-stock items".`;

describe("rows a condition alone left out, held to the request's own words", () => {
  it("refuses a quote of the words the request searched by, beside the row", () => {
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is left out, because the request asks for "garden tools".`)).toEqual([
      { nodeId: "read", condition: REQUEST_WORDS_CONDITIONS.handle, rows: [REQUEST_WORDS_HANDLE] }
    ]);
  });

  it("refuses a reason in the judge's own words", () => {
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is a spare part, not a tool, so it is rightly left out.`)).toEqual([
      { nodeId: "read", condition: REQUEST_WORDS_CONDITIONS.handle, rows: [REQUEST_WORDS_HANDLE] }
    ]);
  });

  it("refuses a quote the request never says", () => {
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is left out: the request wants "complete tools only".`)).toHaveLength(1);
  });

  it("refuses a quote of the request's words that are only where it looked", () => {
    expect(unquoted(`${STOCK_SAID} Replacement Handle for Garden Tools is left out: "collect every result on the first page".`)).toHaveLength(1);
  });

  it("refuses a quote that stands in another sentence than the row", () => {
    expect(unquoted(`Copper Garden Tools Pair and Replacement Handle for Garden Tools are left out. The request says "leaving out out-of-stock items".`)).toEqual([
      { nodeId: "read", condition: REQUEST_WORDS_CONDITIONS.stock, rows: [REQUEST_WORDS_OUT_OF_STOCK] },
      { nodeId: "read", condition: REQUEST_WORDS_CONDITIONS.handle, rows: [REQUEST_WORDS_HANDLE] }
    ]);
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
