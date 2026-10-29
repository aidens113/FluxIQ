// The t515 re-ask of a split's no whose advice adds an unstated exclusion
// (`../exclusion-words.ts`): its clause inviting a no by "the words naming what
// the request asks for" is dropped where the request asks for every result it
// looks through (framework plan P5, debug `run-mvtdoyf3-47ffaac1` fix F3), and
// kept for a request for a kind of thing (t628).
import { describe, expect, it } from "vitest";
import { automationStudioRequestAsksEveryResult } from "../../asked-words/index.ts";
import { exclusionRecheckWords } from "../exclusion-words.ts";

const NAMING = "or the words naming what the request asks for, which that row by its own words is not";

describe("the re-ask of a no that adds an unstated exclusion", () => {
  it("keeps the clause naming what the request asks for under a request for a kind of thing (t628)", () => {
    const asks = automationStudioRequestAsksEveryResult("Find garden gloves and list them, with their title and format.");
    expect(asks).toBe(false);
    expect(exclusionRecheckWords(["hooks"], asks)).toContain(NAMING);
    expect(exclusionRecheckWords(["hooks"])).toContain(NAMING);
  });

  it("drops it where the request asks for every result its search shows", () => {
    const asks = automationStudioRequestAsksEveryResult("Search the catalog for garden gloves and list every result the search shows, leaving out reference copies.");
    expect(asks).toBe(true);
    const words = exclusionRecheckWords(["hooks"], asks);
    expect(words).not.toContain(NAMING);
    expect(words).toContain("answer no over a row the result keeps only where you quote words of the request that it fails: words that exclude it.");
    expect(words).toContain("\"hooks\"");
  });
});
