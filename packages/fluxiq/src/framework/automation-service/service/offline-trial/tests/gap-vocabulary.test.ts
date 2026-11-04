// P4c: every reason the trace matcher can answer a command's gap with is a
// reason the trial evidence result contract (U5) knows, spelled alike. The
// gateway keeps its own copy because it never imports a program
// (`client-gateway/trace-matcher/gap-reasons.ts`); this fails the moment the
// two drift. The reasons only a program gives (a judge's, a phase's, a
// source's) are pinned too, so a code added on either side is a deliberate
// edit here, and so are the snapshot reasons a reevaluation answers with (P5a).
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS, CLIENT_GATEWAY_TRACE_STATE_GAP_CODES } from "../../../../../client-gateway/index.ts";
import { AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES } from "../../../../../flows/authoring/model/index.ts";

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

/** The state rule's own reasons (`client-gateway/trace-state/gap-codes.ts`): only a state trial gives them, never the matcher, so a gate's words need not cover them until one is wired in. */
const STATE_RULE_ONLY = [
  "state_changed_by_act",
  "other_position",
  "would_repeat_act",
  "after_unrecorded_act",
  "after_unrecorded_move",
  "other_row",
  "act_out_of_order",
  "wait_longer_than_recorded",
  "wait_shorter_than_recorded"
];

/** The reasons a reevaluation on a recorded snapshot can answer with (D33): the trace holds no usable snapshot, or the read needed page behaviour a snapshot cannot give. */
const SNAPSHOT_REASONS = ["snapshot_unavailable", "dynamic_content"];

describe("the trace matcher's gap reasons", () => {
  it("are all in the trial evidence reason vocabulary", () => {
    const known: readonly string[] = AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES;
    expect(CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS.filter((reason) => !known.includes(reason))).toEqual([]);
    expect(CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS.length).toBeGreaterThan(0);
  });

  it("include the snapshot reasons a reevaluation can answer with, on both sides", () => {
    const matcher: readonly string[] = CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS;
    const known: readonly string[] = AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES;
    for (const reason of SNAPSHOT_REASONS) {
      expect(matcher).toContain(reason);
      expect(known).toContain(reason);
    }
  });

  it("leave exactly the program's own reasons, the source and judge reasons among them, and the state rule's out of the matcher", () => {
    const matcher: readonly string[] = CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS;
    expect(AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES.filter((reason) => !matcher.includes(reason))).toEqual([...PROGRAM_ONLY, ...STATE_RULE_ONLY]);
  });

  it("the state rule's are all in the trial evidence reason vocabulary, spelled alike", () => {
    const known: readonly string[] = AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES;
    expect(CLIENT_GATEWAY_TRACE_STATE_GAP_CODES.filter((reason) => !known.includes(reason))).toEqual([]);
    const matcher: readonly string[] = CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS;
    expect(CLIENT_GATEWAY_TRACE_STATE_GAP_CODES.filter((reason) => !matcher.includes(reason))).toEqual(STATE_RULE_ONLY);
  });
});
