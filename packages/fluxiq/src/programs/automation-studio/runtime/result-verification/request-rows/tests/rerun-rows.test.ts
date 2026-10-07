// What a rerun of a read did to the rows Core's check named (live run
// `run-mux6naez-6c20f26e`, R3-3): the first test's judgement said step 9's name
// condition alone left out Lumo Audio Drift Pro and two more; the repair's first
// rerun of the read kept all three (13 rows), nothing said so, and the model
// reran the read six more times instead of completing.
import { describe, expect, it } from "vitest";
import { automationStudioRequestRowsAfterRerun, type AutomationStudioRequestRowsNamed } from "../index.ts";
import { RUN_MUW60J7C_PAIRS_LEFT_OUT } from "./run-muw60j7c.ts";

const [LUMO, AURELLE, TREVIO] = RUN_MUW60J7C_PAIRS_LEFT_OUT as [string, string, string];

/** The judgement's named rows: step 9's name condition, the three pairs sold with a charging case. */
const NAMED: AutomationStudioRequestRowsNamed[] = [{ step: 9, condition: "name", rows: [{ label: LUMO }, { label: AURELLE }, { label: TREVIO }] }];

/** Ten rows the first test kept, none of them named. */
const KEPT_BEFORE = Array.from({ length: 10 }, (_, index) => `Kept Pair ${index + 1} Wireless Earbuds, Bluetooth 5.3 Headphones, Black`);

describe("the rows the check named, after a rerun of the read", () => {
  it("all kept (13 rows): says so, by label, and to complete so the Flow is tested again", () => {
    const after = automationStudioRequestRowsAfterRerun(NAMED, [...KEPT_BEFORE, LUMO, AURELLE, TREVIO], 5);
    expect(after?.kept).toEqual([LUMO, AURELLE, TREVIO]);
    expect(after?.stillLeftOut).toEqual([]);
    expect(after?.said).toContain("This rerun of step 5 keeps all 3");
    expect(after?.said).toContain("the condition \"name\" of step 9");
    expect(after?.said).toContain(LUMO);
    expect(after?.said).toContain("complete, so the Flow is tested again from its start");
  });

  it("some still out: names the kept and the still left out, and does not say to complete", () => {
    const after = automationStudioRequestRowsAfterRerun(NAMED, [...KEPT_BEFORE, LUMO], 5);
    expect(after?.kept).toEqual([LUMO]);
    expect(after?.stillLeftOut).toEqual([AURELLE, TREVIO]);
    expect(after?.said).toContain(`now keeps 1 of them: ${LUMO}`);
    expect(after?.said).toContain(`It still leaves out 2: ${AURELLE}; ${TREVIO}`);
    expect(after?.said).not.toContain("complete");
  });

  it("none kept: says every one is still left out", () => {
    const after = automationStudioRequestRowsAfterRerun(NAMED, KEPT_BEFORE);
    expect(after?.kept).toEqual([]);
    expect(after?.said).toContain("This rerun still leaves out all 3");
  });

  it("matches as the check does: the label word for word, a row said with its tested value, an id, a four-word distinguishing prefix", () => {
    const named: AutomationStudioRequestRowsNamed[] = [{
      nodeId: "node.s7", condition: "name not contains",
      rows: [{ label: LUMO }, { label: "Aurelle Echo Wireless Earbuds, Ivory", ids: ["B0J5MCMBAY"] }, { label: "Trevio T5 Wireless Earbuds, Rose Gold" }, { label: "Pulsebud Mini Wireless Earbuds, Black" }]
    }];
    const after = automationStudioRequestRowsAfterRerun(named, [
      `${LUMO.toUpperCase().replace(/,/gu, "")} — name: x`,
      "Aurelle Echo B0J5MCMBAY Wireless Earbuds",
      "Trevio T5 Wireless Earbuds, Rose Gold, Gift Box",
      "(withheld)"
    ]);
    expect(after?.kept).toEqual([LUMO, "Aurelle Echo Wireless Earbuds, Ivory", "Trevio T5 Wireless Earbuds, Rose Gold"]);
    expect(after?.stillLeftOut).toEqual(["Pulsebud Mini Wireless Earbuds, Black"]);
    expect(after?.said).toContain("of read node.s7");
  });

  it("does not match by a prefix shorter than four words, or one two rerun rows start with", () => {
    const named: AutomationStudioRequestRowsNamed[] = [{ step: 9, condition: "name", rows: [{ label: "Aurelle Pods Fit" }, { label: "Novaq Q20 Wireless Earbuds, Sage" }] }];
    const after = automationStudioRequestRowsAfterRerun(named, [
      "Aurelle Pods Fit Wireless Earbuds, Ivory",
      "Novaq Q20 Wireless Earbuds, Sage, Pair A",
      "Novaq Q20 Wireless Earbuds, Sage, Pair B"
    ]);
    expect(after?.kept).toEqual([]);
  });

  it("is nothing when the check named no row", () => {
    expect(automationStudioRequestRowsAfterRerun([], [LUMO])).toBeUndefined();
  });
});
