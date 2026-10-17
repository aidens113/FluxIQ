// What a contradicted doubt is asked again with (`../recheck-words.ts`): a
// narrowing doubt's frame says what a step's record cannot show (t686), and
// the other kinds keep theirs. Core's words, naming no site or task.
import { describe, expect, it } from "vitest";
import { automationStudioResultDoubtRecheckWords } from "../index.ts";

const UNSHOWN = "A site filter's option words do not show that each kept row meets the words of the request; a row's own text does.";

describe("a contradicted doubt's recheck", () => {
  it("about a narrowing step says what the step's record cannot show", () => {
    const words = automationStudioResultDoubtRecheckWords("narrowing", "Step s2 chose \"Hardcover\" in \"Format\".");
    expect(words).toContain(`says otherwise: Step s2 chose "Hardcover" in "Format". ${UNSHOWN} Answer again from the evidence`);
  });

  it("about pages or a dedupe is as before", () => {
    expect(automationStudioResultDoubtRecheckWords(undefined, "Read r1 read 2 pages.")).toBe(
      "This same evidence was judged before, and that answer could not tell because it took the list to have pages its read never reached. Core's own record of each paging read says otherwise: Read r1 read 2 pages. "
      + "Answer again from the evidence, holding any reading about pages to that record; answer unknown only for a doubt the record does not settle."
    );
    expect(automationStudioResultDoubtRecheckWords("dedupe", "It removed none.")).not.toContain(UNSHOWN);
  });
});
