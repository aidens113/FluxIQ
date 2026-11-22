// t963: an attempt's trail is held for the whole attempt across a resume (`../held.ts`), so a carried-on attempt's judge
// still sees what came before the person's press; a Run again starts its own; a Core that restarted says it holds none.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstTrailsOf } from "../index.ts";

const FIRST = { did: "catalogue.read", outcome: "answered" };

describe("an attempt's trail across a resume", () => {
  it("issues source authority only for a new uninterrupted journal and never restores it from valid metadata", () => {
    const journal = automationStudioAnswerFirstTrailsOf({});
    const trail = journal.of("attempt.source-owner", { carriedOn: false, askedAgain: false });
    const owner = journal.sourceOwner(trail);
    expect(owner).toBeDefined();
    trail.push({ did: "example.read", judgeEvidence: { version: 1, role: "data", evidence: { observed: 1 }, missing: [], withheld: false } });
    const checkpoint = journal.checkpoint(trail, {}, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] })!;
    expect(journal.sourceOwner(journal.of("attempt.source-owner", { carriedOn: true, askedAgain: false, judgeEvidence: checkpoint }))).toBe(owner);
    const reopened = automationStudioAnswerFirstTrailsOf({});
    const restored = reopened.of("attempt.source-owner", { carriedOn: true, askedAgain: false, judgeEvidence: JSON.parse(JSON.stringify(checkpoint)) });
    expect(reopened.sourceOwner(restored)).toBeUndefined();
    const later = reopened.checkpoint(restored, {}, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] })!;
    expect(later.revision).toBeGreaterThan(checkpoint.revision);
    expect(reopened.sourceOwner(restored)).toBeUndefined();
  });
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

  // t965: run-mwodpw10-3d5748ab's second attempt was judged on its own saved Flow run alone (judge 0117, 23 entries), and so it must stay.
  it("gives a later attempt only its own trail: none of an earlier attempt's calls, however many it made", () => {
    const trails = automationStudioAnswerFirstTrailsOf({});
    const first = trails.of("attempt.1", { carriedOn: false, askedAgain: false });
    for (let n = 0; n < 39; n += 1) first.push({ did: "page.read", outcome: "answered", found: { n } });
    const second = trails.of("attempt.2", { carriedOn: false, askedAgain: false });
    second.push({ did: "web.output.browser-navigate", outcome: "succeeded" });
    expect(second).toEqual([{ did: "web.output.browser-navigate", outcome: "succeeded" }]);
    expect(first).toHaveLength(39);
    // And a carry-on of the second holds the second's, not the first's.
    expect(trails.of("attempt.2", { carriedOn: true, askedAgain: false })).toBe(second);
  });

  it("says the earlier calls are not held where this Core holds none of a carried-on attempt's, never making them up", () => {
    const resumed = automationStudioAnswerFirstTrailsOf({}).of("attempt.1", { carriedOn: true, askedAgain: false });
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({ did: "core.earlier_calls_not_held", outcome: "not_held" });
  });
});
