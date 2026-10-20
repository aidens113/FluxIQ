// Coverage of cut-at-word.ts: a sentence longer than its bound is cut where
// a word ends, never inside one (U-4 of the run-muw60j7c-bb7c9a62 UI review:
// "Search Bri…", "trying another w…", "the check found the…" for "they").

import { expect, test } from "vitest";

import { cutAtWord } from "../index.ts";

test("a sentence within its bound is left whole", () => {
  expect(cutAtWord("Running step 2 of 5: Open the cart", 160)).toBe("Running step 2 of 5: Open the cart");
  expect(cutAtWord("exactly ten", 11)).toBe("exactly ten");
});

test("a longer sentence ends on the last whole word that fits, then an ellipsis", () => {
  const sentence = "Run failed: It returned 30 rows, but the check found they don't answer what you asked";
  for (let max = 12; max < sentence.length; max += 1) {
    const cut = cutAtWord(sentence, max);
    expect(cut.length <= max, `${max}: ${cut}`).toBeTruthy();
    expect(cut.endsWith("…"), cut).toBeTruthy();
    const kept = cut.slice(0, -1);
    expect(sentence.startsWith(kept), cut).toBeTruthy();
    // The character after what was kept is a space or punctuation the cut dropped: never the inside of a word.
    expect(sentence.charAt(kept.length), `${max}: "${cut}" cuts inside a word`).toMatch(/[\s,;:—-]/u);
  }
  expect(cutAtWord("the check found they don't answer", 21)).toBe("the check found they…");
  expect(cutAtWord("the check found they don't answer", 19)).toBe("the check found…");
});

test("no dangling comma, colon or dash is left before the ellipsis", () => {
  expect(cutAtWord("Updating the Flow — that didn't work, trying another way", 22)).toBe("Updating the Flow…");
  expect(cutAtWord("It returned 30 rows, but the check", 22)).toBe("It returned 30 rows…");
});

test("a quote left open by the cut is closed, so the name reads as cut", () => {
  expect(cutAtWord("Trying again: typing \"wireless earbuds\" into “Search Brightaisle”", 54)).toBe("Trying again: typing \"wireless earbuds\" into “Search…”");
});

test("one word longer than the bound has no word end to cut at, so it is cut where the bound falls", () => {
  expect(cutAtWord("x".repeat(400), 160).length).toBe(160);
});
