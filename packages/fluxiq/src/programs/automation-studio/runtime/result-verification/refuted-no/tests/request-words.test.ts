// A no calling rows missing that a condition testing the request's own words
// left out, on a value Core read failing them, is refuted (t629): the
// attributive and generic wordings are read as the claim, and the dispute
// exemption lifts only where the condition restates the request.
import { describe, expect, it } from "vitest";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading, automationStudioResultRequestTextTest } from "../index.ts";
import {
  AVAILABLE_TODAY, BOOK_ABBEY, BOOK_FOG, BOOK_LEDGER, LIBRARY_REQUEST,
  libraryRequestText, libraryRunSummary, libraryWording
} from "./library-fixture.ts";
import { DROPPED_INCLUDING_NO, MISSING_LIST_NO, MISSING_QUALIFYING_NO, UNREAD_TITLE_NO, VALUE_SAID_NO } from "./library-readings-fixture.ts";

type Options = Parameters<typeof libraryRunSummary>[0];
const record = (options: Options = {}, body = LIBRARY_REQUEST) => {
  const summary = libraryRunSummary(options);
  return automationStudioResultNoRecord({ summary, requestText: libraryRequestText(body), wording: libraryWording(summary, body) });
};

describe("which settled rows fail the request's own words", () => {
  it("are the rows of a positive text test whose text the request says, each with the value Core read", () => {
    const rows = record().leftOut.filter((row) => row.condition.startsWith("condition 2"));
    expect(rows.map((row) => [row.label, row.quotesRequest, row.quoted?.read])).toEqual([
      [BOOK_FOG, true, "Available tomorrow"], [BOOK_LEDGER, true, "On hold until Monday"], [BOOK_ABBEY, true, "Available tomorrow"]
    ]);
    // A numeric bound's settled row is settled, but tests no words of the request.
    expect(record().leftOut.find((row) => row.condition.startsWith("condition 1"))).toMatchObject({ settled: true, quotesRequest: false });
  });

  it("are none where the text is not the request's, is negated or a pattern, or the request offers another beside it", () => {
    const says = libraryWording().says;
    const text = libraryRequestText();
    expect(automationStudioResultRequestTextTest(AVAILABLE_TODAY, text, says)).toEqual(["Available to borrow today"]);
    expect(automationStudioResultRequestTextTest("availability contains [\"On the shelf\"]", text, says)).toBeUndefined();
    expect(automationStudioResultRequestTextTest("availability not contains [\"Available to borrow today\"]", text, says)).toBeUndefined();
    expect(automationStudioResultRequestTextTest("availability matches \"Available to borrow today\"", text, says)).toBeUndefined();
    expect(automationStudioResultRequestTextTest("availability contains [\"Available to borrow today\"] and atLeast 4", text, says)).toBeUndefined();
    const either = LIBRARY_REQUEST.replace("available to borrow today", "available to borrow today or tomorrow");
    expect(automationStudioResultRequestTextTest(AVAILABLE_TODAY, libraryRequestText(either), libraryWording(libraryRunSummary(), either).says)).toBeUndefined();
    expect(record({}, either).leftOut.some((row) => row.quotesRequest)).toBe(false);
  });

  it("are none over a read that kept no row: its conditions show no value that passes them", () => {
    expect(record({ kept: 0 }).leftOut.some((row) => row.quotesRequest)).toBe(false);
  });
});

describe("a no calling those rows missing", () => {
  it("is refuted in step 0068's words: \"missing qualifying rows including ...\", naming the request's words and the value Core read", () => {
    const weighed = automationStudioResultRefutedReading(MISSING_QUALIFYING_NO, record());
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings[0]).toContain(`Core's read saw "${BOOK_FOG}", and only condition 2 (${AVAILABLE_TODAY}) left it out: that condition tests the request's own words "Available to borrow today", and Core read "Available tomorrow" on that row, which fails it as written.`);
    expect(weighed.findings[0]).toContain(`Core read "On hold until Monday" on that row`);
  });

  it("is refuted in step 0071's words, \"Missing qualifying rows: ...\", and step 0072's, \"condition 2 ... dropped 3 rows including ...\"", () => {
    expect(automationStudioResultRefutedReading(MISSING_LIST_NO, record()).wholly).toBe(true);
    expect(automationStudioResultRefutedReading(DROPPED_INCLUDING_NO, record()).wholly).toBe(true);
  });

  it("giving those rows the very text the condition looks for is refuted on the value Core read (step 0080)", () => {
    const weighed = automationStudioResultRefutedReading(VALUE_SAID_NO, record());
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings).toContain(`Core's read found "Available tomorrow" on "${BOOK_FOG}", not "Available to borrow today": condition 2 (${AVAILABLE_TODAY}) tests that value, and it fails it as written. Core's read found "Available tomorrow" on "${BOOK_ABBEY}", not "Available to borrow today": condition 2 (${AVAILABLE_TODAY}) tests that value, and it fails it as written.`);
  });

  it("stands where the condition's text is not the request's words: disputing that condition is the judge's to weigh", () => {
    const wording = "availability (read \"On the shelf\" on a row it kept) contains [\"On the shelf\"]";
    const named = (no: typeof DROPPED_INCLUDING_NO) => ({ ...no, observed: no.observed.replaceAll(AVAILABLE_TODAY, wording) });
    expect(automationStudioResultRefutedReading(named(DROPPED_INCLUDING_NO), record({ wording })).wholly).toBe(false);
    // Said without speaking of the condition, the rows are still settled ones, and the claim is refuted as before (t607).
    expect(automationStudioResultRefutedReading({ observed: `Missing qualifying rows: ${BOOK_FOG}; ${BOOK_LEDGER}.` }, record({ wording })).wholly).toBe(true);
  });

  it("stands where the request offers another value beside its words", () => {
    const either = LIBRARY_REQUEST.replace("available to borrow today", "available to borrow today or tomorrow");
    expect(automationStudioResultRefutedReading(DROPPED_INCLUDING_NO, record({}, either)).wholly).toBe(false);
  });

  it("stands where it names a row the read left out without reading its value: a real defect Core cannot refute", () => {
    const weighed = automationStudioResultRefutedReading(UNREAD_TITLE_NO, record({ unread: true }));
    expect(weighed.wholly).toBe(false);
    // Beside the refuted claims, the unread row keeps the whole no standing.
    expect(automationStudioResultRefutedReading({ observed: `${MISSING_QUALIFYING_NO.observed}\n${UNREAD_TITLE_NO.observed}` }, record({ unread: true })).wholly).toBe(false);
  });

  it("stands where it says a stored row lacks a value: a claim about its cell, not a row called missing", () => {
    expect(automationStudioResultRefutedReading({ observed: "The rating value of Harbor Lights at Midnight, Hardcover is not included." }, record()).wholly).toBe(false);
  });
});
