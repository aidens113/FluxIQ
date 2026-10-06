// R2-U-3 (live run `run-muwansvz-a2b4a987`, moments 06 and 08): a judge's
// sentence was split after "(e.g." and the next sentence glued on: "Stored
// rows include sponsored items (e.g. Repairing it live."
import { describe, expect, it } from "vitest";
import { activityActionSentences } from "../index.ts";

describe("activityActionSentences", () => {
  it("splits after a full stop, a question or an exclamation followed by a space", () => {
    expect(activityActionSentences("One row came back.  Was it right? Yes!")).toEqual(["One row came back.", "Was it right?", "Yes!"]);
    expect(activityActionSentences("  ")).toEqual([]);
    expect(activityActionSentences("No stop at the end")).toEqual(["No stop at the end"]);
  });

  it("never splits after e.g., i.e., vs. or cf., nor inside a number", () => {
    expect(activityActionSentences("Rows include ads, e.g. the first two. Then more.")).toEqual(["Rows include ads, e.g. the first two.", "Then more."]);
    expect(activityActionSentences("Keep one, i.e. the cheaper one. Done.")).toEqual(["Keep one, i.e. the cheaper one.", "Done."]);
    expect(activityActionSentences("Price vs. Rating was compared. Rated 4.0 or more.")).toEqual(["Price vs. Rating was compared.", "Rated 4.0 or more."]);
    // "etc." ends a sentence only before a capital.
    expect(activityActionSentences("Ear tips, cases etc. are kept. Then more.")).toEqual(["Ear tips, cases etc. are kept.", "Then more."]);
    expect(activityActionSentences("Ear tips, cases, etc. Then more.")).toEqual(["Ear tips, cases, etc.", "Then more."]);
  });

  it("never splits inside parentheses", () => {
    expect(activityActionSentences("Rows include ads (e.g. Item One. Item Two), and repeats. Next.")).toEqual(["Rows include ads (e.g. Item One. Item Two), and repeats.", "Next."]);
  });

  it("drops an aside left unclosed, so no sentence ends inside an open parenthesis", () => {
    expect(activityActionSentences("Stored rows include sponsored items (e.g. Item One, Item Two…")).toEqual(["Stored rows include sponsored items."]);
    expect(activityActionSentences("Rows include ads (e.g. Item One. Then the next sentence.")).toEqual(["Rows include ads.", "Then the next sentence."]);
    expect(activityActionSentences("First. Rows include ads (one, two, and more, Last sentence.")).toEqual(["First.", "Rows include ads."]);
    for (const sentence of activityActionSentences("A (b (c) d. E (f")) expect(sentence.split("(").length).toBe(sentence.split(")").length);
  });

  it("splits at a semicolon too when asked for clauses", () => {
    expect(activityActionSentences("It kept all rows; none were left out (a; b). Next.", { clauses: true })).toEqual(["It kept all rows;", "none were left out (a; b).", "Next."]);
    expect(activityActionSentences("It kept all rows; none were left out.")).toEqual(["It kept all rows; none were left out."]);
  });
});
