// What a build's failure code means, in words that finish "failed: ...".
//
// One table for every place that says why a build stopped: the chat's ending
// of a build (`../../conversations/commands/progress.ts`) and a project
// builder's return card (`../project/return-words.ts`, t649), which read
// "Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress)"
// to the person before (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, 00008).

/** Each code's words. First match wins. */
const CODE_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  // A build's own endings, each named for what happened rather than the stage it ended in (t362, round 4's C6).
  [/evidence_repeat_without_progress$/u, "it kept trying without getting any further, so it was stopped"],
  [/evidence_unusable_decision$|model_replies_unreadable$|provider_response_malformed$/u, "the model's answer could not be used"],
  [/evidence_limit$/u, "it reached the limit on how much it may read from the page"],
  [/evidence_tool_failed$/u, "a step it tried failed in a way it could not go on from"],
  [/evidence_cancelled$/u, "it was stopped"],
  [/blank_target_required$/u, "FluxIQ could not tell which part of this Flow to build on, as it builds on a Flow with one main part"],
  [/pending_adaptation_exists$/u, "a suggested change to this Flow is already waiting for you to accept or set aside"],
  [/generation_lock_failed$/u, "another build of this Flow was already under way"],
  [/active_instructions_required$/u, "the Flow has no instruction saying what it should do"],
  [/secret_unavailable/u, "your model key is locked"],
  [/provider_refused|request_refused/u, "the request to the model was refused"],
  [/auth_failed/u, "the model's credentials were not accepted"],
  [/rate_limited/u, "the model was too busy to answer"],
  [/timeout|timed_out|aborted|deadline/u, "it ran out of time"],
  [/network_error|http_error|redirect_rejected|provider_request_failed/u, "the model could not be reached"],
  [/provider_resolution|provider_resolver/u, "no model was set up to build it"],
  [/cost_exhausted|cost_limit|spend/u, "it reached its spending limit"],
  [/run_budget_\w+_exhausted|evidence_budget_exhausted/u, "it reached the limit on how much it may do"]
];

/** What `code` means, in words that finish "failed: ..."; undefined for a code with no words of its own. */
export function automationStudioActivityFailureCodeWords(code: string): string | undefined {
  return CODE_WORDS.find(([pattern]) => pattern.test(code))?.[1];
}
