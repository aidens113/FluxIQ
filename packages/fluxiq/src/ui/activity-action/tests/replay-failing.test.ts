import { describe, expect, it } from "vitest";
import { activityActionReplayFailing } from "../index.ts";

describe("activityActionReplayFailing", () => {
  it.each(["core.replay.replayed", "core.replay.verified", "core.replay.present", "core.replay.remembered", " CORE.REPLAY.REMEMBERED "])("reads %s as a step that held", (code) => {
    expect(activityActionReplayFailing(code)).toBe(false);
  });

  it.each(["core.replay.failed", "core.replay.changed", "core.replay.unreproducible", "core.replay.reset_failed", "core.replay.something_new"])("reads %s as a step that did not hold", (code) => {
    expect(activityActionReplayFailing(code)).toBe(true);
  });

  it("says nothing of a code that is not a replay's", () => {
    expect(activityActionReplayFailing("web.action.failed")).toBe(false);
  });
});
