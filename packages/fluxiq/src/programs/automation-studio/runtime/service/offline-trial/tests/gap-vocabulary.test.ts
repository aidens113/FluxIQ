// P4c: every reason the trace matcher can answer a command's gap with is a
// reason the trial evidence result contract (U5) knows, spelled alike. The
// gateway keeps its own copy because it never imports a program
// (`client-gateway/trace-matcher/gap-reasons.ts`); this fails the moment the
// two drift. The reasons only a program gives (a judge's, a phase's, a
// source's) are pinned too, so a code added on either side is a deliberate
// edit here.
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS } from "../../../../../../client-gateway/index.ts";
import { AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES } from "../../../../model/index.ts";

/** U5's reasons the matcher never answers a command with: the program's own. */
const PROGRAM_ONLY = [
  "unsupported_timing",
  "assertion_failure",
  "future_read_blocked",
  "live_effect_blocked",
  "model_request_changed",
  "stale_checkpoint",
  "offline_not_allowed_in_phase",
  "source_not_live",
  "judgement_unavailable"
];

describe("the trace matcher's gap reasons", () => {
  it("are all in the trial evidence reason vocabulary", () => {
    const known: readonly string[] = AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES;
    expect(CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS.filter((reason) => !known.includes(reason))).toEqual([]);
    expect(CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS.length).toBeGreaterThan(0);
  });

  it("leave exactly the program's own reasons, the source and judge reasons among them, out of the matcher", () => {
    const matcher: readonly string[] = CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS;
    expect(AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES.filter((reason) => !matcher.includes(reason))).toEqual(PROGRAM_ONLY);
  });
});
