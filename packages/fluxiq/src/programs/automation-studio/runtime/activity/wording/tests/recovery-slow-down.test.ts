// A retry the site asked to wait for says so (t378, lane D,
// `run-mv0fuual-f9e6f089`): Circleway's "You're going too fast" read "The step
// didn't work, and a step like this often works on a second try".
import { describe, expect, it } from "vitest";
import { automationStudioActivityRecoveryChoice } from "../index.ts";

describe("a retry the site asked to wait for", () => {
  it("says the site asked to slow down and how long FluxIQ waits before pressing again", () => {
    expect(automationStudioActivityRecoveryChoice({ kind: "retry", rung: "retry_node" }, { siteWaitMs: 5_500, presses: true })).toEqual({
      title: "Waiting: the site asked to slow down",
      text: "The site asked FluxIQ to slow down, so it is waiting 6 seconds before pressing again."
    });
    expect(automationStudioActivityRecoveryChoice({ kind: "retry" }, { siteWaitMs: 900 }).text).toBe("The site asked FluxIQ to slow down, so it is waiting 1 second before trying the step again.");
  });

  it("says a slow-down notice with no named wait as a moment", () => {
    expect(automationStudioActivityRecoveryChoice({ kind: "retry", rung: "await_recorded_state" }, { slowedDown: true, presses: true }).text)
      .toBe("The site asked FluxIQ to slow down, so it is waiting a moment before pressing again.");
  });

  it("keeps the ordinary words for a retry the site asked nothing of", () => {
    const choice = automationStudioActivityRecoveryChoice({ kind: "retry", rung: "retry_node" }, { siteWaitMs: 0 });
    expect(choice.title).toBe("Trying the step again");
    expect(automationStudioActivityRecoveryChoice({ kind: "stop" }, { siteWaitMs: 5_000, attempts: 2 }).title).toBe("Trying again didn't help");
  });
});
