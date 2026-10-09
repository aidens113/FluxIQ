// How far a command got, so a failure is never a bare verdict.
//
// A command is several registry calls in a row -- create, save, build, apply --
// and a person told only "it failed" cannot tell whether a Flow was left
// behind, whether what they said was kept, or whether trying again would make
// a second one. So each command records every step that landed, and a failure
// says why it stopped and how far it had got.

import { automationStudioActivityCheckRefusalReasons, automationStudioActivityIssueWords } from "../../activity/index.ts";
import { automationStudioActivityRefusedStepIssues } from "../../activity/wording/index.ts";
import { automationStudioCandidateRefusalCodes } from "../../service/candidate-failure/index.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandOutcome } from "./command.ts";

/** What the outcome carries however it ends: the ids made, and whose words an instruction it saved were. */
type Ids = Pick<AutomationStudioConversationCommandOutcome, "flowId" | "runId" | "adaptationId" | "instructionFrom">;

export type AutomationStudioConversationCommandProgress = {
  /** Records a step that landed, in words that finish "I ...". */
  landed(step: string): void;
  /** Remembers an id, or whose words were saved, for the result to carry whether it ends well or not. */
  carry(ids: Ids): void;
  succeeded(summary: string): AutomationStudioConversationCommandOutcome;
  /**
   * `cause` finishes "... because ..." and is always the outcome's `error`.
   * `account.ending`, when given, is a work's own account of why it stopped,
   * written for the person (a build's ending), and opens the answer alone in
   * place of "<title> stopped because <cause>": both together said the
   * failure three times ("stopped because the build could not finish. I could
   * not build this Flow ...", t195 `run-murdouox-c5294247`). `account.left`
   * says what the failure leaves behind in place of the steps that landed,
   * for a command whose landed steps read as the opposite of the failure.
   * `account.kept`, when given, says what the work kept although it failed
   * (a candidate build's draft and its test runs, t362), after the rest.
   *
   * The opening never names the command: a person never typed "Create an
   * automation here", and lanes B-D ended quoting it (t378). A registry
   * call's own cause ("the build failed: ...") opens the answer as a sentence;
   * any other says "I stopped because ...".
   */
  failed(cause: string, account?: { ending?: string | undefined; left?: string | undefined; kept?: string | undefined }): AutomationStudioConversationCommandOutcome;
};

export function automationStudioConversationCommandProgress(_title: string, keyLocked: boolean): AutomationStudioConversationCommandProgress {
  const steps: string[] = [];
  const ids: Ids = {};
  return {
    landed: (step) => { steps.push(step); },
    carry: (next) => { Object.assign(ids, Object.fromEntries(Object.entries(next).filter(([, value]) => typeof value === "string" && value))); },
    succeeded: (summary) => ({ status: "done", summary, ...ids }),
    failed: (cause, account = {}) => {
      // What is stored is what an old thread shows again, so it is said plain however the cause was worded (t276).
      const plainCause = automationStudioConversationPlainCause(cause) || "something went wrong inside FluxIQ";
      const opening = account.ending ? `${account.ending.replace(/\.$/u, "")}.` : CALL_CAUSE.test(plainCause) ? `${plainCause.charAt(0).toUpperCase()}${plainCause.slice(1)}.` : `I stopped because ${plainCause}.`;
      const distance = account.left ?? (steps.length ? `Before that I ${joined(steps)}.` : "Nothing was changed.");
      const kept = account.kept ? ` ${account.kept}` : "";
      const locked = keyLocked ? " Your model key is locked for this browser: unlock your keys in FluxIQ, then ask again." : "";
      return { status: "failed", summary: `${opening} ${distance}${kept}${locked}`, error: plainCause, ...ids };
    }
  };
}

/**
 * Why a registry call failed, in a clause that finishes "because ...", in
 * plain words. A build that failed carries Core's own diagnostic: its message
 * for the person when it wrote one, else what its code means, else what its
 * stage means -- never the code itself. Live run `run-muw60unq-591e23bd` (U1)
 * opened on an earlier thread that read "the build failed: Flow Bootstrap
 * generation failed (flow_bootstrap.blank_target_required)
 * (pre_provider_validation: flow_bootstrap.blank_target_required)" (t276).
 */
export function automationStudioConversationCallCause(what: string, response: AutomationStudioConversationCommandCallResult): string {
  const diagnostic = (response.payload as { diagnostic?: Diagnostic } | undefined)?.diagnostic;
  // A build that could not finish carries a message written for the person --
  // not doable and why, or the budget that ran out -- which says more than any
  // code, so it is what they read (`flow-bootstrap/generation-failure/build-ending.ts`).
  const ending = diagnostic?.ending?.message;
  if (typeof ending === "string" && ending.trim()) return `${what} could not finish. ${ending.trim().replace(/\.$/u, "")}`;
  const code = typeof diagnostic?.code === "string" ? diagnostic.code : codesIn(response.error ?? "")[0];
  const meant = (code && NO_PROGRESS.test(code) ? refusedWords(diagnostic) : undefined)
    ?? (code && ITERATION_LIMIT.test(code) ? exhaustedWords(diagnostic?.evidenceLoop?.exhausted) : undefined)
    ?? (code ? CODE_WORDS.find(([pattern]) => pattern.test(code))?.[1] : undefined)
    ?? (typeof diagnostic?.stage === "string" && Object.hasOwn(STAGE_WORDS, diagnostic.stage) ? STAGE_WORDS[diagnostic.stage] : undefined);
  const said = meant ?? (automationStudioConversationPlainCause(response.error ?? "") || (code ? "something went wrong inside FluxIQ" : "no reason was given"));
  return `${what} failed: ${said}`;
}

/** A dotted name: a code Core names a failure by (`flow_bootstrap.blank_target_required`, `llm.provider_timeout`) where it holds an underscore. */
const DOTTED = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:\.[a-z0-9]+(?:_[a-z0-9]+)*)+\b/gu;

/** The codes in `text`, in order: dotted names holding an underscore, so an address such as "example.com" is not one. */
function codesIn(text: string): string[] {
  return [...text.matchAll(DOTTED)].map((found) => found[0]).filter((name) => name.includes("_"));
}

/** What a failed build's diagnostic is read for here. */
type Diagnostic = {
  code?: unknown;
  stage?: unknown;
  ending?: { message?: unknown };
  evidenceLoop?: { exhausted?: { bound?: unknown; budgetBound?: unknown } };
  issueCodes?: unknown;
  candidate?: { revision?: unknown; trialCount?: unknown };
  refusedSteps?: unknown;
};

/** A candidate build that stopped for no progress: what its last refused submission was refused for says why (`refusedWords`). */
const NO_PROGRESS = /evidence_repeat_without_progress$/u;

/**
 * Why a candidate build stopped for no progress, in words that finish
 * "failed: ...", from the last refused submission its failure carries
 * (`../../service/candidate-failure/refusal-codes.ts`, t378): that the Flow it
 * wrote was refused, how many times in a row, why the last time in each issue's
 * own words, how often it was then sent again unchanged, and, where no version
 * was ever accepted or tested, that nothing was tested. A step the failure
 * carries the model's words for (`refusedSteps`) is named by them: lane D's
 * ending said "a step was given a setting it doesn't take" of the step "keep
 * requests with 5 or more mutual friends". Lane C ended "it kept
 * trying without getting any further, so it was stopped" over a Flow refused
 * for a misplaced repeat and then sent again unchanged three times. Nothing
 * when the failure carries no refused submission.
 */
function refusedWords(diagnostic: Diagnostic | undefined): string | undefined {
  const refusal = automationStudioCandidateRefusalCodes.decode(Array.isArray(diagnostic?.issueCodes) ? diagnostic.issueCodes : []);
  if (!refusal) return undefined;
  const named = automationStudioActivityIssueWords(automationStudioActivityRefusedStepIssues(refusal.issues, diagnostic?.refusedSteps), true, true).reasons;
  const reasons = named.length ? named : automationStudioActivityCheckRefusalReasons({ refusal: refusal.family });
  const times = refusal.refusals > 1 ? ` ${refusal.refusals} times in a row` : "";
  const because = reasons.length ? `${refusal.refusals > 1 ? ", the last time" : ""} because ${joined(reasons)}` : "";
  const again = refusal.sentAgain === 1 ? ", and then it was sent again unchanged" : refusal.sentAgain > 1 ? `, and then it was sent again unchanged ${refusal.sentAgain} times` : "";
  const candidate = diagnostic?.candidate;
  const untested = candidate && candidate.revision === undefined && candidate.trialCount === 0 ? ", so nothing was tested" : "";
  return `the Flow it wrote was refused${times}${because}${again}${untested}`;
}

/** A build that ran out of an allowance: what ran out says why (`exhaustedWords`). */
const ITERATION_LIMIT = /evidence_iteration_limit$/u;

/**
 * Which allowance a build ran out of, in words that finish "failed: ...": the
 * budget that ran out where one did, else the decisions or steps it may take.
 * Round 4 (`run-muyrpbnk-fef374e7`, C6) showed what a code with no words of its
 * own came to: its stage's, "the model's answer could not be used".
 */
function exhaustedWords(exhausted: { bound?: unknown; budgetBound?: unknown } | undefined): string {
  const budget = typeof exhausted?.budgetBound === "string" && Object.hasOwn(BUDGET_WORDS, exhausted.budgetBound) ? BUDGET_WORDS[exhausted.budgetBound] : undefined;
  if (budget) return budget;
  return exhausted?.bound === "tool_calls" ? "it reached the limit on how many steps it may try" : "it reached the limit on how many decisions it may make";
}

/** Each budget a build can run out of, in words that finish "failed: ...". */
const BUDGET_WORDS: Readonly<Record<string, string>> = Object.freeze({
  cost: "it reached its spending limit",
  tokens: "it reached the limit on how much the model may read and write for one build",
  duration: "it ran out of time",
  calls: "it reached the limit on how many times it may ask the model",
  iterations: "it reached the limit on how many decisions it may make"
});

/** What a failure code means, in words that finish "failed: ...". First match wins. */
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

/** What each stage of a build means when it is where the build failed, for a code with no words of its own. */
const STAGE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  pre_provider_validation: "FluxIQ could not set the build up",
  provider_resolution: "no model was set up to build it",
  provider_request: "the model could not be reached, or did not answer",
  provider_output_validation: "the model's answer could not be used",
  post_provider_validation: "what the model wrote could not be used",
  persistence: "what it made could not be saved"
});

/**
 * A failure's words with no code in them: a code in parentheses, with or
 * without its stage, is left out, as is the API's own "Flow Bootstrap
 * generation failed" heading; and words that still hold a code are not plain
 * at all, so nothing is left. No closing full stop.
 */
export function automationStudioConversationPlainCause(text: string): string {
  const said = text
    .replace(/\s*\((?:[a-z_]+:\s*)?[a-z][a-z0-9_]*(?:\.[a-z0-9_-]+)+\)/gu, "")
    .replace(/\bFlow Bootstrap generation failed\b\.?/giu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[\s:.]+$/u, "");
  return codesIn(said).length ? "" : said;
}

/** A cause `automationStudioConversationCallCause` wrote: "<what> failed: <why>", or "<what> could not finish. <ending>". */
const CALL_CAUSE = /^[a-z][A-Za-z ]* (?:failed: |could not finish\. )/u;

function joined(steps: readonly string[]): string {
  if (steps.length <= 1) return steps[0] ?? "";
  return `${steps.slice(0, -1).join(", ")} and ${steps[steps.length - 1]}`;
}
