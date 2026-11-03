// A condition whose tested value is the row's own label is never read as the
// request's own words (t651, A8 frozen pair 4 `run-mva446jf-926a3c72`), though
// its text is a word of the request: Core measured the name, not what the
// word is about. A condition over a column of its own still is. On a hardware
// store's drill search: no task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadCondition } from "../../read-condition.ts";
import { automationStudioResultConditionTestsLabel, automationStudioResultNoRecord, automationStudioResultRefutedReading, automationStudioResultRequestTextTest } from "../index.ts";
import {
  DRILL_HALDEN, DRILL_ORMSBY, DRILL_PRO, DRILL_SLOW, DRILL_TORVIK, HOUSE, SELLER_IS_TITLE, SELLER_LINE, hardwareRequestText, hardwareRunSummary, hardwareWording
} from "./hardware-fixture.ts";
import { NAME_PREFIX_NO } from "./hardware-readings-fixture.ts";

type Options = Parameters<typeof hardwareRunSummary>[0];
const record = (options: Options = {}) => {
  const summary = hardwareRunSummary(options);
  return automationStudioResultNoRecord({ summary, requestText: hardwareRequestText(), wording: hardwareWording(summary) });
};
const STORED = [{ label: DRILL_PRO.name, cells: { name: DRILL_PRO.name, price: DRILL_PRO.price } }];

describe("a condition that tests a row's own label (t651)", () => {
  it("tests the request's own words by its text alone, as t629 reads it: the house name is a word of the request", () => {
    // The cue three words after the second "House" is outside t629's window, so both readings are clean; the label rule, not the window, decides.
    expect(automationStudioResultRequestTextTest(SELLER_IS_TITLE, hardwareRequestText(), hardwareWording().says)).toEqual([HOUSE]);
  });

  it("quotes none of the rows it left out, and accounts for none of them", () => {
    const named = record();
    const seller = named.leftOut.filter((row) => row.condition.startsWith("condition 3"));
    expect(seller.map((row) => [row.label, row.settled, row.quotesRequest])).toEqual([
      [DRILL_TORVIK, true, false], [DRILL_HALDEN, true, false], [DRILL_ORMSBY, true, false]
    ]);
    const condition = named.conditions?.find((entry) => entry.number === 3);
    expect(condition?.leftOut?.map((row) => row.accounted)).toEqual([undefined, undefined, undefined]);
  });

  it("leaves standing a no that says it tests the name and dropped rows the request asks for, and its advice to remove it", () => {
    const weighed = automationStudioResultRefutedReading(NAME_PREFIX_NO, record());
    expect(weighed.wholly).toBe(false);
    expect(weighed.findings.join(" ")).not.toContain("tests the request's own words");
    expect(weighed.findings.join(" ")).not.toContain("Removing or loosening it alone brings back no row");
  });

  it("is told by each signal of Core's own record, compared whole and folded", () => {
    const base: AutomationStudioResultReadCondition = { number: 1, condition: `maker startsWith ["${HOUSE}"]`, alone: 1, leftOutOnlyByThis: [DRILL_TORVIK], leftOutObservations: [{ source: "read", page: 1, item: 1, readKind: "text", state: "present", value: "Torvik" }], leftOutSettled: [DRILL_TORVIK] };
    // A column of its own: its value only starts the label.
    expect(automationStudioResultConditionTestsLabel(base, STORED)).toBe(false);
    // The account marks it as testing the label column.
    expect(automationStudioResultConditionTestsLabel({ ...base, testedLabel: true }, STORED)).toBe(true);
    // A left-out row's witness is its own label, said with Core's row id before it, in another case and with a closing stop.
    expect(automationStudioResultConditionTestsLabel({ ...base, leftOutOnlyByThis: [`[row K4R7M2] ${DRILL_TORVIK}`], leftOutObservations: [{ source: "read", page: 1, item: 1, readKind: "text", state: "present", value: `${DRILL_TORVIK.toUpperCase()}.` }] }, STORED)).toBe(true);
    // The value read on a kept row is a stored row's label.
    expect(automationStudioResultConditionTestsLabel({ ...base, condition: `maker (read "${DRILL_PRO.name}" on a row it kept) startsWith ["${HOUSE}"]` }, STORED)).toBe(true);
    // A stored column that holds each stored row's label.
    expect(automationStudioResultConditionTestsLabel({ ...base, condition: `name startsWith ["${HOUSE}"]` }, STORED)).toBe(true);
    expect(automationStudioResultConditionTestsLabel({ ...base, condition: `price startsWith ["$"]` }, STORED)).toBe(false);
    // A withheld label is no label to compare.
    expect(automationStudioResultConditionTestsLabel({ ...base, leftOutOnlyByThis: ["(withheld)"], leftOutObservations: [{ source: "read", page: 1, item: 1, readKind: "text", state: "present", value: "(withheld)" }] }, STORED)).toBe(false);
  });
});

describe("a no calling a row missing that only a test of its own name left out (t651 round 2, t607)", () => {
  const missing = (...labels: string[]) => ({ observed: `Missing rows: ${labels.join("; ")}.` });

  it("stands though it names no condition: Core read only the row's name, so the claim disputes that condition", () => {
    const named = record();
    expect(named.leftOut.filter((row) => row.condition.startsWith("condition 3")).every((row) => row.testsLabel === true)).toBe(true);
    expect(automationStudioResultRefutedReading(missing(DRILL_TORVIK, DRILL_HALDEN), named).wholly).toBe(false);
    // Beside a row a column of its own left out, the name-test row still keeps the sentence standing.
    expect(automationStudioResultRefutedReading(missing(DRILL_SLOW, DRILL_ORMSBY), named).wholly).toBe(false);
  });

  it("is still refuted where a condition over a column of its own left the row out", () => {
    const named = record();
    expect(named.leftOut.find((row) => row.label === DRILL_SLOW)?.testsLabel).toBeUndefined();
    const weighed = automationStudioResultRefutedReading(missing(DRILL_SLOW), named);
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings[0]).toContain(`Core read "Delivery in 6 days" on that row`);
    // The same rows, left out by a seller line of its own: refuted as before.
    const line = record({ sellerLine: true });
    expect(line.leftOut.some((row) => row.testsLabel)).toBe(false);
    expect(automationStudioResultRefutedReading(missing(DRILL_TORVIK, DRILL_HALDEN), line).wholly).toBe(true);
  });
});

describe("a condition over a column of its own (t629 kept)", () => {
  it("still quotes the request's words on the rows it left out: the delivery column beside the label rule", () => {
    const delivery = record().leftOut.find((row) => row.condition.startsWith("condition 1"));
    expect(delivery).toMatchObject({ label: DRILL_SLOW, settled: true, quotesRequest: true, quoted: { texts: ["Delivery tomorrow"], read: "Delivery in 6 days" } });
    expect(record().conditions?.find((entry) => entry.number === 1)?.leftOut).toEqual([{ label: DRILL_SLOW, accounted: { by: "request_words", texts: ["Delivery tomorrow"] } }]);
  });

  it("still settles a seller line that fails the house name, and refutes the no that calls those rows wrongly left out", () => {
    const named = record({ sellerLine: true });
    expect(named.leftOut.filter((row) => row.condition.startsWith("condition 3")).every((row) => row.quotesRequest)).toBe(true);
    expect(named.conditions?.find((entry) => entry.number === 3)?.leftOut?.every((row) => row.accounted?.by === "request_words")).toBe(true);
    const lineNo = { ...NAME_PREFIX_NO, observed: NAME_PREFIX_NO.observed.replace(SELLER_IS_TITLE, SELLER_LINE).replace(": the seller column reads the product name, not the seller", "") };
    expect(automationStudioResultRefutedReading(lineNo, named).wholly).toBe(true);
  });
});
