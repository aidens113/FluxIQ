import { describe, expect, it } from "vitest";
import { automationStudioInstructedActs } from "../instruction-acts.ts";

// Live run 28 (`run-munvvc3z-3eadc185`, bigbox-retail): the instruction asked
// for two packs of the towels in one size and a pack of the napkins in
// another. The reader kept the count and the sizes only as quote text, so a
// Flow that chose no size and set no quantity passed the check, and missed the
// goal. A quantity above one and a named variant of an added item are now each
// a requirement of their own, linked to the act they qualify.
const RUN_28 = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";

const choicesOf = (instruction: string) => automationStudioInstructedActs(instruction).map((act) => [act.id, (act.requires ?? []).map((choice) => [choice.id, choice.choice, choice.value])]);

describe("the choices an instruction attaches to an item it adds", () => {
  it("reads run 28's quantity and both sizes, each linked to its own act", () => {
    const acts = automationStudioInstructedActs(RUN_28);
    expect(acts.map((act) => [act.id, act.kind])).toEqual([["a1", "set"], ["a2", "add_to"], ["a3", "add_to"]]);
    expect(acts[0]).not.toHaveProperty("requires");
    expect(acts[1]?.requires).toEqual([
      { id: "a2.quantity", kind: "set", of: "a2", choice: "quantity", value: "two", quote: "two packs" },
      { id: "a2.size", kind: "set", of: "a2", choice: "variant", value: "12 Double Rolls", quote: "in the 12 Double Rolls size" }
    ]);
    expect(acts[2]?.requires).toEqual([{ id: "a3.size", kind: "set", of: "a3", choice: "variant", value: "250 Count", quote: "in the 250 Count size" }]);
  });

  it.each([
    ["the crossborder hub to cart", "On Farbazaar, put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain. Collect that store's coupon while you are on the item. Do not buy anything.", [["a1", [["a1.quantity", "quantity", "three"], ["a1.colour", "variant", "Space Grey"], ["a1.version", "variant", "7-in-1"], ["a1.origin", "variant", "Spain"]]], ["a2", []]]],
    ["the everything-store kettles", "Put two Tidewell electric kettles in sage green, 1.7 litre, sold by Brightaisle itself, in my cart, and move the phone case that is already in my cart to Save for later.", [["a1", [["a1.quantity", "quantity", "two"], ["a1.colour", "variant", "sage green"]]], ["a2", []]]],
    ["the crossborder hub bought", "On Farbazaar, buy two of the Voltbay USB-C hub sold by Voltbay Official Store: Space Grey, the 7-in-1 version, shipped from Spain, with standard shipping.", [["a1", [["a1.quantity", "quantity", "two"], ["a1.colour", "variant", "Space Grey"], ["a1.version", "variant", "7-in-1"], ["a1.origin", "variant", "Spain"]]]]],
    ["where it ships from, named with the", "Add the Harbour rain jacket, ships from the UK, to my cart.", [["a1", [["a1.origin", "variant", "UK"]]]]],
    ["a size by letter", "Add the Harbour rain jacket in size M to my cart.", [["a1", [["a1.size", "variant", "M"]]]]],
    ["a colour on its own", "Add the enamel mug in blue to my basket.", [["a1", [["a1.colour", "variant", "blue"]]]]],
    ["a quantity in digits", "Add 3 packs of the paper towels to my cart.", [["a1", [["a1.quantity", "quantity", "3"]]]]],
    ["a quantity beside a price threshold", "Add two kettles under £50 to my cart.", [["a1", [["a1.quantity", "quantity", "two"]]]]]
  ])("reads %s", (_label, instruction, expected) => {
    expect(choicesOf(instruction)).toEqual(expected);
  });

  it.each([
    ["a quantity of one, in words", "Add one pack of the paper towels to my cart."],
    ["a quantity of one, in digits", "Add 1 pack of the paper towels to my cart."],
    ["a bare article", "Add a kettle to my cart."],
    ["a bare article before a vowel", "Add an enamel kettle to my cart."],
    ["a price threshold", "Add the cheapest kettle under 50 to my cart."],
    ["a price in a currency", "Add a kettle under £50 to my cart."],
    ["a threshold in words", "Add a kettle that costs less than thirty pounds to my cart."],
    ["a rating threshold", "Add the kettle rated 4.5 stars or higher to my cart."],
    ["a count of different items", "Add the three cheapest kettles to my cart."],
    ["all and a count", "Add all three kettles to my cart."],
    ["two different things", "Add two different kettles to my cart."],
    ["a weight", "Add 500 g of flour to my basket."],
    ["the same size", "Add the kettle in the same size to my cart."],
    ["a colour in the product's name", "Add the Navy Harbour jacket to my cart."],
    ["a save, which chooses nothing", "Save two tables in the large size to my saved items."],
    ["a store switch", "Switch my pickup store to the one in Green Lane."],
    ["a count the verb does not govern", "Add the kettle to my cart if two or more are in stock."],
    ["a place that names no warehouse", "Add the kettle shipped from the warehouse to my cart."]
  ])("reads no choice from %s", (_label, instruction) => {
    const acts = automationStudioInstructedActs(instruction);
    expect(acts.length).toBeGreaterThan(0);
    for (const act of acts) expect(act, instruction).not.toHaveProperty("requires");
  });
});

// The user's order, 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
// ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION." Until then an act carried
// its first four choices and each quote stopped at 120 characters.
describe("an act's choices have no cap", () => {
  it("reads every choice of an item, not the first four", () => {
    expect(choicesOf("On Farbazaar, put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, the 2 metre length, the braided material, the matte finish, shipped from Spain.")).toEqual([
      ["a1", [
        ["a1.quantity", "quantity", "three"],
        ["a1.colour", "variant", "Space Grey"],
        ["a1.version", "variant", "7-in-1"],
        ["a1.length", "variant", "2 metre"],
        ["a1.material", "variant", "braided"],
        ["a1.finish", "variant", "matte"],
        ["a1.origin", "variant", "Spain"]
      ]]
    ]);
  });
});
