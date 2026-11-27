// An edit that changed nothing on a draft, sent again on the same draft, climbs the ladder as a repeated refusal does (t1078).
//
// Live run `run-mwyt3s48-b943f344`: `repeat step 7 while step 8` and `result step 7`, refused already so at 0024, 0030 and
// 0035 on a draft that stayed as it was. The detector steered at the second (0030, `same_fix`), told the model the next
// like it would be refused before it ran, and then ran the third (0035) and refused it again: only an edit that had
// changed the draft was known to the guard, so one that changed nothing was never refused unrun.
import { describe, expect, it } from "vitest";
import { automationStudioLlmLoopAttemptRecord, automationStudioLlmLoopDetector, automationStudioLlmLoopWatch } from "../index.ts";

const sent = { key: "step 7 repeat while step 8; step 7 result", draftBefore: "draft at 0023", draftAfter: "draft at 0023", applied: 0, undone: false, changes: [{ step: 7, change: "repeat" }, { step: 7, change: "result" }] };

describe("an edit that changed nothing", () => {
  it("is not refused unrun the first time or the second, and is steered at the second", () => {
    const detector = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord() });
    expect(detector.amendmentRepeats(sent.key, sent.draftBefore)).toBeUndefined();
    expect(detector.amended(sent).finding).toBeUndefined();
    expect(detector.amendmentRepeats(sent.key, sent.draftBefore)).toBeUndefined();
    expect(detector.amended(sent).finding?.pattern).toBe("same_fix");
  });

  it("is refused before it runs the third time on the draft it changed nothing on twice", () => {
    const detector = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord() });
    detector.amended(sent);
    detector.amended(sent);
    expect(detector.amendmentRepeats(sent.key, sent.draftBefore)).toMatchObject({ pattern: "same_fix", repeats: 2, toolIds: ["amend_draft"] });
  });

  it("is a new edit on a draft that has since changed, and is another edit on the same draft", () => {
    const detector = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord() });
    detector.amended(sent);
    detector.amended(sent);
    expect(detector.amendmentRepeats(sent.key, "a draft with one more step")).toBeUndefined();
    expect(detector.amendmentRepeats("another edit", sent.draftBefore)).toBeUndefined();
  });

  it("is refused by the watch once the ladder stands, and not before", () => {
    const watching = automationStudioLlmLoopWatch({ record: automationStudioLlmLoopAttemptRecord() });
    expect(watching.amended(sent)).toBeUndefined();
    expect(watching.checkAmendment(sent.key, sent.draftBefore)).toBeUndefined();
    expect(watching.amended(sent)?.pattern).toBe("same_fix");
    expect(watching.checkAmendment(sent.key, sent.draftBefore)?.pattern).toBe("same_fix");
  });
});
