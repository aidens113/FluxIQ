import { describe, expect, it } from "vitest";
import { isPersonWords, looksLikeToken } from "../person-words.ts";

describe("isPersonWords", () => {
  it("keeps the words a person reads", () => {
    for (const words of [
      "Right columns, cheapest first, no duplicates",
      "3 results pages",
      "shop.example, results page",
      "shop.example > Cart",
      "Added 1 of Item #4 to the cart",
      "Price > 10 and rating of 4.5",
      "Dates like 2026-11-03"
    ]) {
      expect(isPersonWords(words), words).toBe(true);
    }
  });

  it("refuses the shapes of an address into a page, markup and a full address", () => {
    for (const shape of [
      "#submit",
      ".card-title",
      "button[data-id=4]",
      "[aria-label='Add']",
      "li:nth-child(2)",
      "//div[@id='x']",
      "<div class=\"x\">",
      "Press <button>Add</button>",
      "https://shop.example/cart?session=abc"
    ]) {
      expect(isPersonWords(shape), shape).toBe(false);
    }
  });

  it("refuses a credential's shape", () => {
    for (const token of [
      "Bearer abc.def",
      "used token a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig"
    ]) {
      expect(looksLikeToken(token), token).toBe(true);
      expect(isPersonWords(token), token).toBe(false);
    }
  });

  it("does not take a long plain word or a long number alone for a credential", () => {
    expect(looksLikeToken("a".repeat(40))).toBe(false);
    expect(looksLikeToken("1".repeat(40))).toBe(false);
  });

  it("refuses what is not one line within its bound", () => {
    for (const bad of ["", "   ", "two\nlines", "tab\there", "x".repeat(501), 4, null, undefined, {}]) {
      expect(isPersonWords(bad)).toBe(false);
    }
    expect(isPersonWords("x".repeat(500))).toBe(true);
    expect(isPersonWords("x".repeat(11), 10)).toBe(false);
  });
});
