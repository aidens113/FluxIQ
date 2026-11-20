// t963: an attempt's trail is held for the whole attempt across a resume (`../held.ts`), so a carried-on attempt's judge
// still sees what came before the person's press; a Run again starts its own; a Core that restarted says it holds none.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstTrailsOf } from "../index.ts";

const FIRST = { did: "catalogue.read", outcome: "answered" };

describe("an attempt's trail across a resume", () => {
  it("is the same trail on a carry-on, so what came before the resume is still in it", () => {
    const trails = automationStudioAnswerFirstTrailsOf({});
    const opened = trails.of("attempt.1", { carriedOn: false, askedAgain: false });
    opened.push(FIRST);
    const resumed = trails.of("attempt.1", { carriedOn: true, askedAgain: false });
    expect(resumed).toBe(opened);
    expect(resumed).toEqual([FIRST]);
  });

  it("starts empty for a new attempt and for a person's Run again", () => {
    const trails = automationStudioAnswerFirstTrailsOf({});
    trails.of("attempt.1", { carriedOn: false, askedAgain: false }).push(FIRST);
    expect(trails.of("attempt.2", { carriedOn: false, askedAgain: false })).toEqual([]);
    expect(trails.of("attempt.1", { carriedOn: true, askedAgain: true })).toEqual([]);
  });

  it("says the earlier calls are not held where this Core holds none of a carried-on attempt's, never making them up", () => {
    const resumed = automationStudioAnswerFirstTrailsOf({}).of("attempt.1", { carriedOn: true, askedAgain: false });
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({ did: "core.earlier_calls_not_held", outcome: "not_held" });
  });
});
