import { describe, expect, it } from "vitest";
import { automationStudioLlmWellFormedAnswerRecords } from "../answer-records.ts";

describe("automationStudioLlmWellFormedAnswerRecords", () => {
  it("keeps a flag and a whole count, rebuilt key by key", () => {
    expect(automationStudioLlmWellFormedAnswerRecords({ asked: true, siteShows: 5 })).toEqual({ asked: true, siteShows: 5 });
    expect(automationStudioLlmWellFormedAnswerRecords({ asked: true, siteShows: 0 })).toEqual({ asked: true, siteShows: 0 });
    expect(automationStudioLlmWellFormedAnswerRecords({ asked: false })).toEqual({ asked: false });
  });

  it("reads nothing from an extra key, a missing flag, or a count that is not a whole number from 0", () => {
    for (const value of [{ asked: true, siteShows: 2, more: 1 }, { siteShows: 2 }, { asked: "yes" }, { asked: true, siteShows: -1 }, { asked: true, siteShows: 2.5 }, { asked: true, siteShows: "2" }, [true], "yes", null, undefined]) {
      expect(automationStudioLlmWellFormedAnswerRecords(value)).toBeUndefined();
    }
  });
});
