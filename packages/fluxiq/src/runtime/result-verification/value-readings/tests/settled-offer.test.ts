// A settled condition's sentence offers only what Core's rule accepts (lead
// decision, 2026-11-03, t841). The rule names a settled condition by
// `condition N`, and by its tested column only where that column can be read
// from the row or the wording and is not one of the answer's own (t790,
// `../../request-rows/summary/reads.ts`). Each offered form is put to the rule.
import { describe, expect, it } from "vitest";
import { automationStudioRequestWording, automationStudioResultLeftOutRowsUnquoted } from "../../request-rows/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { AUDIOBOOKS_INSTRUCTION, audiobooksRunSummary } from "./audiobooks-fixture.ts";
import { CATALOGUE_QUOTED_YES, CATALOGUE_REQUEST, processingCatalogue, processingVerdict } from "./processing-catalogue.ts";
import { automationStudioResultSettledRows } from "../settled-rows.ts";

/** What the sentence tells a judge to name: the words between "in a sentence that names" and the request's words it asks for. */
const offered = (settled: string): string[] => {
  const words = /in a sentence that names (.+?), the request's own words/su.exec(settled)?.[1];
  if (!words) throw new Error("no offer in the sentence");
  return words.split(" or ");
};

const heldFor = (summary: AutomationStudioRunResultSummary, instructions: ReadonlyArray<{ title: string; body: string }>, number: number, reply: string) =>
  automationStudioResultLeftOutRowsUnquoted(summary, reply, automationStudioRequestWording(instructions as Parameters<typeof automationStudioRequestWording>[0], summary)!)
    .filter((entry) => entry.condition.includes(`condition ${number}`));

describe("a tested column that is one of the answer's own", () => {
  const summary = () => processingCatalogue();
  const sentence = () => summary().recordSets[0]!.processing!.conditions![0]!.settled!;
  const instructions = [{ title: "Goal", body: CATALOGUE_REQUEST }];
  const held = (reply: string) => heldFor(summary(), instructions, 1, reply);

  it("is an answer column the rule refuses, whether or not the sentence offers it", () => {
    expect(summary().recordSets[0]!.columns).toContain("shelf");
    expect(held('The shelf column carries out "shelf status Available today".').length).toBeGreaterThan(0);
  });

  it("is not offered: the sentence offers the condition alone", () => {
    expect(offered(sentence())).toHaveLength(1);
    expect(offered(sentence())[0]).toMatch(/^condition 1\b/u);
    expect(sentence()).not.toMatch(/ or shelf\b/u);
  });

  it("leaves an offer the rule takes, and the verdict with it", () => {
    for (const form of offered(sentence())) {
      const reply = `${form.replace(/^c/u, "C")} carries out "shelf status Available today".`;
      expect(held(reply), form).toEqual([]);
      expect(processingVerdict(summary(), reply)).toMatchObject({ verdict: "answers" });
    }
    expect(processingVerdict(summary(), CATALOGUE_QUOTED_YES)).toMatchObject({ verdict: "answers" });
  });
});

describe("a tested column the answer does not store", () => {
  const summary = () => audiobooksRunSummary();
  const condition = () => summary().reads![0]!.conditions![1]!;

  it("is offered beside the condition, and the rule takes each form", () => {
    expect(summary().recordSets[0]!.columns).not.toContain("shelf");
    const forms = offered(condition().settled!);
    expect(forms).toHaveLength(2);
    expect(forms[1]).toBe("shelf");
    for (const form of forms) {
      expect(heldFor(summary(), [AUDIOBOOKS_INSTRUCTION], 2, `${form} carries out "my branch has".`), form).toEqual([]);
    }
  });
});

describe("a column the rule cannot read from the row or the wording", () => {
  const row = { row: "An Atlas of Rivers", cell: undefined, witness: { state: "present" as const, value: "On loan" } };

  it("is not offered where the condition's wording is withheld", () => {
    const settled = automationStudioResultSettledRows({ condition: { field: "shelf", contains: "Available" }, column: "shelf", number: 1, wording: undefined, leftOut: [row], answerColumns: new Set() });
    expect(offered(settled!.settled)).toHaveLength(1);
    expect(offered(settled!.settled)[0]).toMatch(/^condition 1\b/u);
  });

  it("is not offered for a bound whose rows say no tested value and whose wording names no text test", () => {
    const settled = automationStudioResultSettledRows({ condition: { field: "pages", atMost: 300 }, column: "pages", number: 1, wording: "pages atMost 300", leftOut: [{ row: "An Atlas of Rivers", cell: { label: "An Atlas of Rivers", value: "412" }, witness: { state: "present", value: "412" } }], answerColumns: new Set() });
    expect(offered(settled!.settled)).toHaveLength(1);
  });

  it("is offered where the wording names it and the answer does not store it", () => {
    const settled = automationStudioResultSettledRows({ condition: { field: "shelf", contains: "Available" }, column: "shelf", number: 1, wording: 'shelf contains "Available"', leftOut: [row], answerColumns: new Set(["title"]) });
    expect(offered(settled!.settled)[1]).toBe("shelf");
  });
});
