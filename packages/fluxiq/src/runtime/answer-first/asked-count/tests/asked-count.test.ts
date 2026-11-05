// What counts as the request asking for an act more than once. The words are a lending library's
// and a plain stationer's, no realistic scenario's. Each "stays at one" is a form that must not
// lift the rule against repeating a lasting act.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstAskedCounts, automationStudioAnswerFirstAskedRepeats } from "../index.ts";

const counts = (request: string) => automationStudioAnswerFirstAskedCounts(request).map((each) => each.count);

describe("the count a request asks for", () => {
  it.each([
    ["Add three of this.", 3],
    ["Add 3 of this.", 3],
    ["add twelve of this", 12],
    ["Renew the card three times.", 3],
    ["Renew the card 4 times.", 4],
    ["Stamp the card twice.", 2],
    ["Stamp the card thrice.", 3],
    ["Add two packs of the pencils to my basket.", 2],
    ["Order 5 of the pencils.", 5],
    ["First list my loans, then renew the card three times.", 3],
    ["Add this 3x.", 3],
    ["Renew the card x3.", 3],
    ["Add x3 of this.", 3],
    ["Add 3x of this.", 3],
    ["Add a dozen of this to my cart.", 12],
    ["Add 2x to my cart.", 2],
    ["Add x20 of this.", 20],
    ["Add a dozen of this to my cart, then renew the card.", 12]
  ])("reads %s", (request, count) => {
    expect(counts(request)).toEqual([count]);
  });

  it.each([
    "Renew the card.",
    "Add this to my basket.",
    "Add one of this.",
    "Find the book listed three times and renew it.",
    "List it three times.",
    "Do not renew the card three times.",
    "Pay three times the price.",
    "Add a couple of these.",
    "Renew the card issued three years ago.",
    "Add 500 g of this.",
    "Add every book to my basket three times.",
    "Save the three cheapest.",
    "Add a 3x zoom lens to my cart.",
    "Add the 2x4 boards to my cart.",
    "Add the 4x6 prints.",
    "Add size 3x to my cart.",
    "Add an x3 model to my cart.",
    "Add this for 3x the price.",
    "Buy the 3x magnifier.",
    "Buy the magnifier in 3x.",
    "A dozen eggs are listed.",
    "List the dozen cheapest.",
    "Add half a dozen of this.",
    "Add a dozen or so.",
    "Add a dozen eggs to my cart.",
    "Add 3x.",
    "Do not add this 3x.",
    "The 3x zoom lens is listed 3x.",
    "Add x1 of this."
  ])("%s stays at one", (request) => {
    expect(counts(request)).toEqual([]);
  });
});

describe("the digits rule holds for a multiplier", () => {
  it("reads x20 as twenty, and x1000 not at all", () => {
    expect(counts("Add x20 of this.")).toEqual([20]);
    expect(counts("Add x1000 of this.")).toEqual([]);
  });
});

describe("whom a count answers for", () => {
  it("a press that names no act has the count when nothing else could be meant", () => {
    expect(automationStudioAnswerFirstAskedRepeats("Add three of this.")(undefined)).toBe(3);
  });

  it("a press that names no act stays at one where two things are asked", () => {
    expect(automationStudioAnswerFirstAskedRepeats("Add two packs of the pencils to my basket, and save the receipt.")(undefined)).toBeUndefined();
  });

  it("a claim has the count of the act it names, and only that", () => {
    const asked = automationStudioAnswerFirstAskedRepeats("Add two packs of the pencils to my basket, and save the receipt.");
    expect(asked("a1")).toBe(2);
    expect(asked("a1.quantity")).toBe(2);
    expect(asked("a2")).toBeUndefined();
    expect(asked("a9")).toBeUndefined();
  });

  it("no claim lifts a request that names no count", () => {
    const asked = automationStudioAnswerFirstAskedRepeats("Renew the card.");
    expect(asked(undefined)).toBeUndefined();
    expect(asked("a1")).toBeUndefined();
    expect(asked("ten")).toBeUndefined();
  });
});
