// Core's check of the rows a judgement names, from live run
// `run-muw60j7c-bb7c9a62` (debug C-5): the result judge of step 0039 said the
// Plus condition "alone excluded 6 rows that satisfy the request, including ...
// B0J5MCMBAY ... B07Z1RZGJG". Both are in the stored result, and the re-author
// followed that reading and threw away the answer it held.
import { describe, expect, it } from "vitest";
import { automationStudioResultCheckedRows } from "../index.ts";
import { RUN_MUW60J7C_RESULT_JUDGE, runMuw60j7cRunSummary } from "./run-muw60j7c.ts";

const judged = (): string => {
  const { summary, diagnosis } = RUN_MUW60J7C_RESULT_JUDGE;
  return [diagnosis.expected, diagnosis.observed, diagnosis.changed, summary].join("\n");
};

describe("the rows a judgement names, checked against what the run holds", () => {
  const checked = automationStudioResultCheckedRows(runMuw60j7cRunSummary(), judged());

  it("says the two rows it calls left out are in the result, and that advice resting on it is not supported", () => {
    const misread = checked.filter((line) => line.includes("the check misread which rows were left out"));
    expect(misread).toHaveLength(2);
    expect(misread[0]).toContain("Aurelle Echo Wireless Earbuds, Bluetooth 5.3 Headphones with 40H Playtime, Built-in Mic, Low Latency Gaming Mode, Ivory (B0J5MCMBAY) is in the result");
    expect(misread[1]).toContain("Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, IPX7 Waterproof, Touch Control, Sage (B07Z1RZGJG) is in the result");
    expect(misread.join("\n")).toContain("advice resting on that reading is not supported");
  });

  it("says which named rows each condition really left out alone, and never calls those misread", () => {
    const plus = checked.find((line) => line.includes("\"plus is present\""));
    expect(plus).toContain("Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Graphite (B0FLQUDT3X)");
    expect(plus).toContain("Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Touch Control, Deep Bass, Sage (B0PXG323U8)");
    expect(plus).not.toContain("B0J5MCMBAY");
    const name = checked.find((line) => line.includes("\"name not contains"));
    expect(name).toContain("Lumo Audio Drift Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Touch Control, White");
    const sponsored = checked.find((line) => line.includes("\"sponsored is absent\""));
    expect(sponsored).toContain("(B0DPN4ANC7)");
    expect(sponsored).toContain("(B0KRUNHK42)");
    expect(checked.filter((line) => line.includes("misread")).join("\n")).not.toMatch(/B0FLQUDT3X|B0PXG323U8|B0DPN4ANC7/u);
  });

  it("copies none of the judgement's own prose", () => {
    for (const line of checked) {
      expect(line).not.toContain("satisfy the request");
      expect(line).not.toContain("aria-label");
    }
  });

  it("says nothing for a judgement that names no row", () => {
    expect(automationStudioResultCheckedRows(runMuw60j7cRunSummary(), "The result has the wrong rows; fix the conditions.")).toEqual([]);
  });

  it("does not call a duplicated row left out (B0PXHP88KT appears twice)", () => {
    expect(checked.join("\n")).not.toContain("B0PXHP88KT");
  });
});
