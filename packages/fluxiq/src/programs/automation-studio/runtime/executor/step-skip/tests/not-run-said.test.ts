import { describe, expect, it } from "vitest";
import { automationStudioStepNotRunSaid as said } from "../index.ts";

// Core's sentence for a step a run never ran on some passes (t796): which passes, why, and for a step that does a
// lasting act that what it does was not done.

describe("what a run says of a step it never ran", () => {
  const banner = "close the library banner";

  it("says a guarded act step's passes, its guard and that its act was not done", () => {
    expect(said({ reason: "guarded", after: banner, passes: [1, 2, 3], of: 3, lasting: true })).toBe(`Not run on passes 1, 2 and 3 of 3: it runs only after "${banner}", which was skipped, so what it does was not done.`);
    expect(said({ reason: "guarded", after: banner, passes: [2], of: 3, lasting: false })).toBe(`Not run on pass 2 of 3: it runs only after "${banner}", which was skipped.`);
  });

  it("says a long run of passes as a range, and a step the run never reached by the passes it missed", () => {
    expect(said({ reason: "guarded", after: banner, passes: Array.from({ length: 21 }, (_, index) => index + 1), of: 21, lasting: true })).toBe(`Not run on passes 1 to 21 of 21: it runs only after "${banner}", which was skipped, so what it does was not done.`);
    expect(said({ reason: "unreached", passes: [3, 5, 6, 7, 8], of: 8, lasting: true })).toBe("Not run on passes 3 and 5 to 8 of 8: the run never reached it on those passes, so what it does was not done.");
    expect(said({ reason: "unreached", passes: [3], of: 3, lasting: true })).toBe("Not run on pass 3 of 3: the run never reached it on that pass, so what it does was not done.");
  });

  it("names no pass outside a repeat, and cuts a long guard label", () => {
    expect(said({ reason: "unreached", passes: [1], lasting: true })).toBe("Not run: the run never reached it, so what it does was not done.");
    expect(said({ reason: "guarded", after: `close ${"the very long ".repeat(10)}banner`, passes: [1], lasting: false })).toMatch(/^Not run: it runs only after "close the very long .{0,70}…", which was skipped\.$/u);
  });
});
