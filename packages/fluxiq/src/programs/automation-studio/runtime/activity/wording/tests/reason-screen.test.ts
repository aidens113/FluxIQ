// What of a model's stated reason the chat may show (t174-w116).
//
// Run `run-musq0b1m-0472cfa0` (deepseek-v4-pro, t174-w111): the chat showed
// "Clicking “×” — tool_call core.run_node" when the model gave no summary and
// Core wrote one from the decision (D15), and reasons in the draft's own
// mechanics -- act ids, "acts are done", "steps are in the draft", "repair the
// unreproducible steps ... then retest" -- under "Checking the Flow is
// finished" and "Updating the draft Flow" (D3).
import { describe, expect, it } from "vitest";
import { automationStudioActivityReasonText } from "../index.ts";

describe("a reason that is only codes (D15)", () => {
  it("shows nothing for a line made only of codes and ids, whatever screen", () => {
    expect(automationStudioActivityReasonText("tool_call core.run_node")).toBeUndefined();
    expect(automationStudioActivityReasonText("tool_call web.find_on_page")).toBeUndefined();
    expect(automationStudioActivityReasonText("amend_draft")).toBeUndefined();
    expect(automationStudioActivityReasonText("tool_call core.run_node", 240, { decision: true })).toBeUndefined();
  });

  it("keeps a person's words, a product name with digits included", () => {
    expect(automationStudioActivityReasonText("Enough.")).toBe("Enough.");
    expect(automationStudioActivityReasonText("Choose 7-in-1")).toBe("Choose 7-in-1");
    expect(automationStudioActivityReasonText("Close the popup.", 240, { decision: true })).toBe("Close the popup.");
  });
});

describe("a decision's reason in the draft's mechanics (D3)", () => {
  const shown = (text: string) => automationStudioActivityReasonText(text, 240, { decision: true });

  it("leaves out each sentence that names an act id or the draft's mechanics, and keeps the rest", () => {
    expect(shown("Select Space Grey, 7-in-1, Spain and quantity 3. That completes act a1.colour and a2.")).toBe("Select Space Grey, 7-in-1, Spain and quantity 3.");
    expect(shown("All acts are done and added to the Flow; completing with a one-sentence description of the result.")).toBeUndefined();
    expect(shown("Checking the Flow is finished: all requested acts are done and steps are in the draft.")).toBeUndefined();
    expect(shown("Repair the unreproducible steps by reordering them to match the actual page flow, then retest.")).toBeUndefined();
    expect(shown("Rerun step 7 with the correct 7-in-1 handle t985.")).toBeUndefined();
    expect(shown("I will reorder the quantity step to come after the colour. The cart needs three.")).toBe("I will reorder the quantity step to come after the colour. The cart needs three.");
  });

  it("does not screen a reason that is not a decision's", () => {
    // The result check's verdict (`result-verification/check-activity.ts`) is the judge's own reading.
    expect(automationStudioActivityReasonText("The draft's three steps put three hubs in the cart.")).toBe("The draft's three steps put three hubs in the cart.");
  });
});

// R2-U-3 (live run `run-muwansvz-a2b4a987`, moments 06 and 08): "Stored rows
// include sponsored items (e.g. Repairing it live." -- a sentence cut inside an
// open parenthesis, and a sentence split after "e.g.".
describe("a reason's sentences, whole (R2-U-3)", () => {
  const shown = (text: string, max = 240) => automationStudioActivityReasonText(text, max, { decision: true });

  it("does not split a decision's reason after an abbreviation or inside parentheses when it screens its sentences", () => {
    // Split after "e.g.", the sentence lost its end and was glued to the next: "Read the ads, e.g. The cart needs three."
    expect(shown("Read the ads, e.g. the ones in step 7. The cart needs three.")).toBe("The cart needs three.");
    expect(shown("Read the list (e.g. the first page. Then the second). Rerun step 7. It has prices.")).toBe("Read the list (e.g. the first page. Then the second). It has prices.");
    expect(shown("Read the ads, e.g. the first ones. Rerun step 7.")).toBe("Read the ads, e.g. the first ones.");
  });

  it("holds a long text to whole sentences, and never cuts one inside an aside", () => {
    const text = `Stored rows include sponsored items (e.g. ${"Item One, ".repeat(30)}Item Two). The rest are fine.`;
    const held = automationStudioActivityReasonText(text, 120)!;
    expect(held.length).toBeLessThanOrEqual(120);
    expect(held.split("(").length).toBe(held.split(")").length);
    expect(held).toBe("Stored rows include sponsored items. The rest are fine.");
    const first = automationStudioActivityReasonText("The rows are fine. The second sentence is a little longer than the room.", 40)!;
    expect(first).toBe("The rows are fine.");
    const cut = automationStudioActivityReasonText(`Rows (${"word ".repeat(40)}) are kept and ${"more ".repeat(40)}`, 60)!;
    expect(cut.length).toBeLessThanOrEqual(60);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.split("(").length).toBe(cut.split(")").length);
  });
});

// R2-U-4 (live run `run-muwansvz-a2b4a987`, moments 04, 05, 06 and 08): the
// model's and the judge's own words for the work reached the chat.
describe("internal words said as a person's (R2-U-4)", () => {
  it("says the list read, reading, result pages and duplicates in a person's words", () => {
    expect(automationStudioActivityReasonText("I'll describe the extract list node so I can add a step that scrapes all result pages with the filters the instruction needs.", 240, { decision: true }))
      .toBe("I'll describe the list reader so I can add a step that reads all result pages with the filters the instruction needs.");
    expect(automationStudioActivityReasonText("Reading the search results list with the extraction node to see the rows, fields and pagination it really returns before adding it to the Flow.", 240, { decision: true }))
      .toBe("Reading the search results list with the list reader to see the rows, fields and the result pages it really returns before adding it to the Flow.");
    expect(automationStudioActivityReasonText("The extraction already read all 5 pages with the needed columns; scraping more is not needed.", 240, { decision: true }))
      .toBe("The list reader already read all 5 pages with the needed columns; reading more is not needed.");
    expect(automationStudioActivityReasonText("Use extract_list to paginate, then dedup by name. Rows are deduplicated, with no deduplication left."))
      .toBe("Use the list reader to page through, then remove duplicates by name. Rows have duplicates removed, with no removing duplicates left.");
    // A word that only holds one of them is left alone.
    expect(automationStudioActivityReasonText("The extractor scraper-free pages")).toBe("The extractor scraper-free pages");
  });

  it("says the judge as the check, a next call as the next step, and no draft step number", () => {
    expect(automationStudioActivityReasonText("Step 8 (web.output.dom-extract_list) kept 82 rows from 5 pages with no filtering or dedup."))
      .toBe("A step kept 82 rows from 5 pages with no filtering or removing duplicates.");
    expect(automationStudioActivityReasonText("The judge said steps 3 and 4 are wrong; the judge's advice is for step 8. Its next call could cost more."))
      .toBe("The check said some steps are wrong; the check's advice is for a step. Its next step could cost more.");
  });
});

// R3-U-9 and R3-U-10 of the live-C round-3 UI review (run-mux6naez-6c20f26e, moments 04, 05, 12): a
// decision's reason ended on ";" once the clause after it was dropped as the draft's mechanics, and
// "the detected extraction handle" read "the detected reading the list handle".
describe("a decision's reason ends as a sentence, and a list's handle is said as the list", () => {
  it("never ends on a semicolon when the clause after it is left out", () => {
    expect(automationStudioActivityReasonText("The extraction already keeps the right rows across all 5 pages; I'll complete the Flow with the search and the filtered list read.", 240, { decision: true }))
      .toBe("The list reader already keeps the right rows across all 5 pages.");
    expect(automationStudioActivityReasonText("The name exclusion wrongly drops earbuds sold with a charging case; I rerun step 5 with a narrower accessory-only exclusion.", 240, { decision: true }))
      .toBe("The name exclusion wrongly drops earbuds sold with a charging case.");
  });

  it("says an extraction handle as the list it names", () => {
    expect(automationStudioActivityReasonText("Reading the search results list with the detected extraction handle to see the real rows and columns before adding the extraction step.", 240, { decision: true }))
      .toBe("Reading the search results list with the detected list to see the real rows and columns before adding the list reader.");
  });
});
