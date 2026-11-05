// Which item each act was on, in a person's words: "Save: Round pine dining table, 90cm" and not "Save" three times.
import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActItemWords, automationStudioAttemptActScreenedWords, type AutomationStudioAttemptActCall } from "../index.ts";

const press = (): AutomationStudioAttemptActCall => ({ actionId: "web.click", parameters: { selector: "#list > li > button", element: { tag: "button", accessibleName: "Save" } }, consequences: ["modify_existing"], stage: "exploration" });

describe("the words of the item an act was on", () => {
  it.each([
    ["the item's whole words", "item 2/6 (£60, Round pine dining table, 90cm, Kelford)", "Round pine dining table, 90cm, Kelford"],
    ["the sentence the model was told", `This acted on item 2/6 (£60, Round pine dining table, 90cm) only, through its "Save"; no other item was acted on.`, "Round pine dining table, 90cm"],
    ["a table row", "row 4 (Ana Ruiz, Invoice for March)", "Ana Ruiz, Invoice for March"],
    ["a place and no words", "item 2/6", undefined],
    ["words with no letters in them", "item 2/6 (£60, 12)", undefined],
    ["an unrelated sentence", "This went fine.", undefined],
    ["nothing", undefined, undefined]
  ])("reads %s", (_name, said, expected) => {
    expect(automationStudioAttemptActItemWords(said)).toBe(expected);
  });

  it("cuts long words at a word, never mid-word, and says so", () => {
    const words = automationStudioAttemptActItemWords(`item 1/3 (${"Solid oak extending dining table with six chairs ".repeat(4)})`)!;
    expect(words.length).toBeLessThanOrEqual(70);
    expect(words.endsWith("...")).toBe(true);
    expect(words).not.toMatch(/\bchai\.\.\.$/u);
  });
});

describe("an act's line names its item", () => {
  it("puts the item after what was done, through the person-words check", () => {
    expect(automationStudioAttemptActScreenedWords({ what: "Save", where: "On the site" }, ["modify_existing"], "Round pine dining table, 90cm")).toEqual({ what: "Save: Round pine dining table, 90cm", where: "On the site" });
  });

  it("falls back to the plain line where the item would make it unfit, and to the generic line with no words at all", () => {
    expect(automationStudioAttemptActScreenedWords({ what: "Save" }, [], "<div class=x>")).toMatchObject({ what: "Save" });
    expect(automationStudioAttemptActScreenedWords({}, ["modify_existing"], "Round pine dining table")).toMatchObject({ what: "Changed something that was already there: Round pine dining table" });
    expect(automationStudioAttemptActScreenedWords({}, ["modify_existing"])).toMatchObject({ what: "Changed something that was already there" });
  });

  it("carries three saves, each on its own listing, and each says which", () => {
    const record = new AutomationStudioAttemptActRecord();
    const titles = ["Round pine dining table, 90cm", "Oak dining table with leaf", "Glass dining table, seats four"];
    titles.forEach((title, index) => record.settled({ ...press(), row: { title: `Listing ${index}`, price: 60 + index } }, { effectApplied: true, words: { what: "Save", where: "" }, actedOn: `item ${index + 1}/6 (£${60 + index}, ${title})` }));
    expect(record.acts().map((act) => act.what)).toEqual(titles.map((title) => `Save: ${title}`));
  });

  it("keeps the listing's words out of what is persisted, and out of what a model is told", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(press(), { effectApplied: true, words: { what: "Save", where: "" }, actedOn: "item 1/6 (£60, Round pine dining table, 90cm)" });
    expect(record.acts()[0]!.what).toBe("Save: Round pine dining table, 90cm");
    expect(JSON.stringify(record.data())).not.toContain("pine");
    expect(JSON.stringify(record.forModel())).not.toContain("pine");
  });

  it("names nothing it was not told: a press that said no item stays as it was", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(press(), { effectApplied: true, words: { what: "Save", where: "" } });
    expect(record.acts().map((act) => act.what)).toEqual(["Save"]);
  });
});
