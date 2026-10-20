// The reason a refusal given again carries in place of its cause (t728): one
// word, read by Core's runtime and its chat card and given by a domain, so it
// may not change without every reader changing with it.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_REPEATED_ANSWER_REASON } from "../index.ts";
import * as automationStudio from "../../automation-studio.ts";

describe("the repeated-answer reason", () => {
  it("is the word every reader and the web domain already use, published on the automation-studio subpath", () => {
    expect(AUTOMATION_STUDIO_REPEATED_ANSWER_REASON).toBe("answered_the_same_again");
    expect(automationStudio.AUTOMATION_STUDIO_REPEATED_ANSWER_REASON).toBe(AUTOMATION_STUDIO_REPEATED_ANSWER_REASON);
  });
});
