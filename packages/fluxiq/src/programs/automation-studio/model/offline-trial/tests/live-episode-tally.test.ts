import { describe, expect, it } from "vitest";
import { tallyAutomationStudioLiveEpisodes } from "../index.ts";
import { livePass, recordedPass } from "./trial-evidence-builders.ts";

describe("live-episode tally", () => {
  it("counts distinct live episodes and their live successes", () => {
    const tally = tallyAutomationStudioLiveEpisodes([
      livePass("run-a"),
      livePass("run-b"),
      livePass("run-c", { verdict: "fail", reasonCodes: ["assertion_failure"] })
    ]);
    expect(tally).toEqual({ liveEpisodes: 3, liveSuccesses: 2 });
  });

  it("deduplicates by live episode id", () => {
    expect(tallyAutomationStudioLiveEpisodes([livePass("run-a"), livePass("run-a"), livePass("run-a")])).toEqual({ liveEpisodes: 1, liveSuccesses: 1 });
  });

  it("T19: 1,000 offline results from one live episode leave the tally unchanged", () => {
    const live = [livePass("run-live-1")];
    const before = tallyAutomationStudioLiveEpisodes(live);
    const replays = Array.from({ length: 1000 }, (_, index) => recordedPass({ sourceEpisodeIds: ["run-live-1"], candidateRevision: index }));
    expect(tallyAutomationStudioLiveEpisodes([...live, ...replays])).toEqual(before);
    expect(tallyAutomationStudioLiveEpisodes(replays)).toEqual({ liveEpisodes: 0, liveSuccesses: 0 });
  });

  it("ignores live segments, derived copies and input that does not validate", () => {
    const tally = tallyAutomationStudioLiveEpisodes([
      recordedPass({ evidenceOrigins: ["recorded", "live"], scope: "segment", liveEpisodeId: "run-seg" }),
      livePass("run-copy", { provenance: "derived" }),
      { verdict: "pass", scope: "full_live_run", evidenceOrigins: ["live"], liveEpisodeId: "run-forged" }
    ]);
    expect(tally).toEqual({ liveEpisodes: 0, liveSuccesses: 0 });
  });

  it("counts an episode as a success when any of its results is a live success", () => {
    const failed = livePass("run-a", { verdict: "fail", reasonCodes: ["assertion_failure"] });
    expect(tallyAutomationStudioLiveEpisodes([failed, livePass("run-a")])).toEqual({ liveEpisodes: 1, liveSuccesses: 1 });
  });
});
