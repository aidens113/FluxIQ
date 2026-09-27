import { describe, expect, it } from "vitest";
import { automationStudioNameSynonymCredit, automationStudioNameTokenCredit } from "../index.ts";

describe("automationStudioNameTokenCredit", () => {
  it("is 1 for the same token and 0 for an empty one", () => {
    expect(automationStudioNameTokenCredit("rating", "rating")).toBe(1);
    expect(automationStudioNameTokenCredit("", "rating")).toBe(0);
    expect(automationStudioNameTokenCredit("rating", "")).toBe(0);
    expect(automationStudioNameTokenCredit("", "")).toBe(0);
  });

  it("credits a near token by what is left of it after the edits", () => {
    // Every pair here was measured scoring nothing at all before, because the
    // token measures asked only whether two tokens were equal: a letter
    // missing, a letter wrong, a plural, a letter dropped from a long word.
    expect(automationStudioNameTokenCredit("prce", "price")).toBe(0.8);
    expect(automationStudioNameTokenCredit("ratng", "rating")).toBeCloseTo(0.833, 3);
    expect(automationStudioNameTokenCredit("ratings", "rating")).toBeCloseTo(0.857, 3);
    expect(automationStudioNameTokenCredit("descripton", "description")).toBeCloseTo(0.909, 3);
  });

  it("refuses two edits inside one token, which is how two different words look", () => {
    // The bound is one edit per four characters of the longer token. Each of
    // these is two edits, and admitting them is what would resolve
    // `upload-file` to `builtin.data.filter-list` -- a name the matcher is
    // measured refusing. A transposition inside a token is not lost by this:
    // over a whole name it is two edits in twenty-seven, and the whole-name
    // rule in `../similarity.ts` resolves it there.
    expect(automationStudioNameTokenCredit("file", "filter")).toBe(0);
    expect(automationStudioNameTokenCredit("send", "set")).toBe(0);
    expect(automationStudioNameTokenCredit("name", "date")).toBe(0);
    expect(automationStudioNameTokenCredit("extarct", "extract")).toBe(0);
  });

  it("requires a token shorter than five characters to be exact", () => {
    // At four characters one edit is a quarter of a single-syllable word, and a
    // slip cannot be told from a different word: `send` is one edit from `end`,
    // `name` from `game`, `list` from `last`. Forgiving this length was measured
    // resolving `sendEmail` to `builtin.control.end`.
    expect(automationStudioNameTokenCredit("send", "end")).toBe(0);
    expect(automationStudioNameTokenCredit("name", "game")).toBe(0);
    expect(automationStudioNameTokenCredit("lst", "list")).toBe(0);
    expect(automationStudioNameTokenCredit("url", "uri")).toBe(0);
    expect(automationStudioNameTokenCredit("dom", "dot")).toBe(0);
  });

  it("credits a different word for the same thing, below every near token", () => {
    expect(automationStudioNameTokenCredit("url", "link")).toBe(0.7);
    expect(automationStudioNameTokenCredit("title", "name")).toBe(0.7);
    expect(automationStudioNameTokenCredit("price", "cost")).toBe(0.7);

    // The ordering the vocabulary depends on: a synonym must never outrank a
    // misspelling of the right word. 0.8 is the least a near token can earn --
    // one edit in the shortest token an edit is forgiven in -- and the synonym
    // credit sits under it.
    expect(automationStudioNameTokenCredit("url", "link")).toBeLessThan(automationStudioNameTokenCredit("prce", "price"));
  });
});

describe("automationStudioNameSynonymCredit", () => {
  it("credits every pair within a group, in both directions", () => {
    for (const group of [["url", "link", "href"], ["title", "name", "heading", "label"], ["price", "cost", "amount"]]) {
      for (const left of group) {
        for (const right of group) {
          if (left === right) continue;
          expect(automationStudioNameSynonymCredit(left, right), `${left} ~ ${right}`).toBe(0.7);
        }
      }
    }
  });

  it("credits nothing across groups, or for a word the vocabulary does not hold", () => {
    expect(automationStudioNameSynonymCredit("url", "title")).toBe(0);
    expect(automationStudioNameSynonymCredit("price", "name")).toBe(0);
    expect(automationStudioNameSynonymCredit("rating", "score")).toBe(0);
    expect(automationStudioNameSynonymCredit("banana", "name")).toBe(0);
  });

  it("requires both words spelled exactly, so two guesses never stack", () => {
    expect(automationStudioNameSynonymCredit("titel", "name")).toBe(0);
    expect(automationStudioNameSynonymCredit("urls", "link")).toBe(0);
  });

  it("is 0 for the same word, which is an exact token rather than a synonym", () => {
    expect(automationStudioNameSynonymCredit("name", "name")).toBe(0);
    expect(automationStudioNameSynonymCredit("", "")).toBe(0);
  });
});
