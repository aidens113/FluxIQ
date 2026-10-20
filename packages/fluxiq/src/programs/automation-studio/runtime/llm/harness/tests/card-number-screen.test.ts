// A card number withheld in place (t728, extension-core boundary audit,
// finding 9): the rules the web domain applied to every page string, now
// Core's, so any domain can withhold a card run and keep the words around it.
// The cases are the web domain's own (`withheld.test.ts`), so the move keeps
// exactly what it caught and what it left alone.
import { describe, expect, it } from "vitest";
import { automationStudioWithoutCardNumbers } from "../evidence-screen.ts";

const MARKER = "(withheld)";

const CARDS = [
  "4111111111111111",
  "4111 1111 1111 1111",
  "4111-1111-1111-1111",
  "5555555555554444",
  "6011111111111117",
  "378282246310005",
  "3782 822463 10005",
  // Diners' 4-6-4.
  "3056 930902 5904",
  // Mastercard's 2-series.
  "2223000048400011"
];

describe("withholding a card number in place", () => {
  it("replaces a Luhn-valid card run, unbroken or grouped as a card is, with the marker and keeps the words around it", () => {
    for (const card of CARDS) {
      expect(automationStudioWithoutCardNumbers(card, MARKER), card).toBe(MARKER);
      expect(automationStudioWithoutCardNumbers(`Card ${card} on file.`, MARKER), card).toBe(`Card ${MARKER} on file.`);
    }
    expect(automationStudioWithoutCardNumbers("4111111111111111 or 5555555555554444", MARKER)).toBe(`${MARKER} or ${MARKER}`);
  });

  it("leaves digit runs that are not card numbers as they were written", () => {
    for (const text of [
      // Fails Luhn.
      "4111111111111112",
      // Luhn-valid, but a millisecond timestamp: no card issuer number starts with 1.
      "1727712000006",
      // Luhn-valid and starting with 4, but grouped as an order number is, not as a card.
      "412-5550123-4567884",
      // Too short, and too long.
      "411111111111",
      "41111111111111111111",
      "Call 555-123-4567",
      "SKU 4006381333931 in stock",
      "Order 112-5550123-4567890 placed at 1727712000000"
    ]) {
      expect(automationStudioWithoutCardNumbers(text, MARKER), text).toBe(text);
    }
  });

  it("gives the same answer however many times it is called", () => {
    const text = "Pay with 4111 1111 1111 1111, not 4111111111111112.";
    expect(automationStudioWithoutCardNumbers(text, MARKER)).toBe(`Pay with ${MARKER}, not 4111111111111112.`);
    expect(automationStudioWithoutCardNumbers(text, MARKER)).toBe(`Pay with ${MARKER}, not 4111111111111112.`);
  });
});
