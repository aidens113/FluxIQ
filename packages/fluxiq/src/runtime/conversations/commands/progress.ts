// How far a command got, so a failure is never a bare verdict.
//
// A command is several registry calls in a row -- create, save, build, apply --
// and a person told only "it failed" cannot tell whether a Flow was left
// behind, whether what they said was kept, or whether trying again would make
// a second one. So each command records every step that landed, and a failure
// says why it stopped and how far it had got.

import { automationStudioActivityCheckRefusalReasons, automationStudioActivityIssueWords } from "../../automation-activity/index.ts";
import { automationStudioActivityFailureCodeWords, automationStudioActivityReasonText, automationStudioActivityRefusedStepIssues, type AutomationStudioActivityIssue } from "../../automation-activity/wording/index.ts";
import { automationStudioCandidateRefusalCodes } from "../../../framework/automation-service/service/candidate-failure/index.ts";
import { automationStudioProjectBuildReasonUnrepeated } from "../../../framework/automation-service/service/project-build-ending/index.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandOutcome } from "./command.ts";
import { automationStudioLlmProviderRefusalWords, parseAutomationStudioLlmProviderRefusal } from "../../models/failures/index.ts";

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
   *
   * `account.told`: the work's own ending row already said how it ended -- a
   * project build's (t753) -- so the answer has no opening: it says what is
   * left of the Flow, what was kept, and what the person can do next, and
   * never the verdict or the reason a second time.
   */
  failed(cause: string, account?: { ending?: string | undefined; left?: string | undefined; kept?: string | undefined; told?: boolean | undefined }): AutomationStudioConversationCommandOutcome;
};

export function automationStudioConversationCommandProgress(_title: string): AutomationStudioConversationCommandProgress {
  const steps: string[] = [];
  const ids: Ids = {};
  return {
    landed: (step) => { steps.push(step); },
    carry: (next) => { Object.assign(ids, Object.fromEntries(Object.entries(next).filter(([, value]) => typeof value === "string" && value))); },
    succeeded: (summary) => ({ status: "done", summary, ...ids }),
    failed: (cause, account = {}) => {
      // What is stored is what an old thread shows again, so it is said plain however the cause was worded (t276).
      const plainCause = automationStudioConversationPlainCause(cause) || "something went wrong inside FluxIQ";
      if (account.told) {
        // The ending row said it (t753): what the Flow keeps, then what to do next, once.
        const left = account.left ?? (steps.length ? `Before that I ${joined(steps)}; the Flow's steps are unchanged.` : "The Flow's steps are unchanged.");
        const said = [left, account.kept ?? ""].filter((sentence) => sentence).join(" ");
        const next = /\bagain\b/u.test(said) ? "" : ` ${AUTOMATION_STUDIO_CONVERSATION_TOLD_NEXT}`;
        return { status: "failed", summary: `${said}${next}`, error: plainCause, ...ids };
      }
      const opening = account.ending ? `${account.ending.replace(/\.$/u, "")}.` : CALL_CAUSE.test(plainCause) ? `${plainCause.charAt(0).toUpperCase()}${plainCause.slice(1)}.` : `I stopped because ${plainCause}.`;
      const distance = account.left ?? (steps.length ? `Before that I ${joined(steps)}.` : "Nothing was changed.");
      const kept = account.kept ? ` ${account.kept}` : "";
      return { status: "failed", summary: `${opening} ${distance}${kept}`, error: plainCause, ...ids };
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
  const refusal = parseAutomationStudioLlmProviderRefusal(diagnostic?.accounting?.providerRefusal);
  const meant = (code && NO_PROGRESS.test(code) ? refusedWords(diagnostic) ?? neverSubmittedWords(diagnostic) : undefined)
    ?? (code && ITERATION_LIMIT.test(code) ? exhaustedWords(diagnostic?.evidenceLoop?.exhausted, diagnostic?.refusedSteps) : undefined)
    ?? supervisorEndingWords(diagnostic)
    // A request the provider refused is said with its own sentence (t1093), read back through the record's own bounds.
    ?? (code ? automationStudioActivityFailureCodeWords(code, refusal) : undefined)
    ?? automationStudioLlmProviderRefusalWords(refusal)
    ?? (typeof diagnostic?.accounting?.providerStatus === "number" ? ANSWERED_WITH_AN_ERROR : undefined)
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
  endedBecause?: unknown;
  /** The call's accounting: the provider's status and, where it refused the request, its refusal record (t1093). */
  accounting?: { providerStatus?: unknown; providerRefusal?: unknown };
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

/** The code a candidate build's completion is refused under when it names no accepted submission (`../../flow-bootstrap/candidate/authoring-loop.ts`). */
const LATEST_SUBMISSION_REQUIRED = "candidate.latest_submission_required";

/**
 * Why a candidate build stopped for no progress when it never had a Flow
 * accepted and kept trying to finish anyway, in words that finish
 * "failed: ...". Lane C (`run-mv0pa79q-ef91811b`) looked at five pages, never
 * submitted a Flow, and tried to finish four times; it ended "it kept trying
 * without getting any further", which named no cause. Said only when the
 * failure's codes hold a refused finish, it carries no refused submission
 * (`refusedWords` says that one), and its candidate shows nothing accepted and
 * nothing tested; nothing otherwise.
 */
function neverSubmittedWords(diagnostic: Diagnostic | undefined): string | undefined {
  const codes = Array.isArray(diagnostic?.issueCodes) ? diagnostic.issueCodes : [];
  if (!codes.includes(LATEST_SUBMISSION_REQUIRED)) return undefined;
  const candidate = diagnostic?.candidate;
  if (!candidate || candidate.revision !== undefined || candidate.trialCount !== 0) return undefined;
  return "it never wrote a Flow to test: it kept trying to finish without one, so it was stopped";
}

/** A build that ran out of an allowance: what ran out says why (`exhaustedWords`). */
const ITERATION_LIMIT = /evidence_iteration_limit$/u;

/**
 * Which allowance a build ran out of, in words that finish "failed: ...": the
 * budget that ran out where one did, else the decisions or steps it may take.
 * Round 4 (`run-muyrpbnk-fef374e7`, C6) showed what a code with no words of its
 * own came to: its stage's, "the model's answer could not be used".
 *
 * A candidate build whose budget ran out while its latest submissions were
 * refused carries those refused steps beside the ending (t1056,
 * `candidate-generation.ts`): no count of refusals ends a build any more, so
 * the budget is what ends one that kept being refused, and the person reads
 * what the money last went on, not only that it ran out (`refusedOnWords`).
 */
function exhaustedWords(exhausted: { bound?: unknown; budgetBound?: unknown } | undefined, refusedSteps: unknown): string {
  const budget = typeof exhausted?.budgetBound === "string" && Object.hasOwn(BUDGET_WORDS, exhausted.budgetBound) ? BUDGET_WORDS[exhausted.budgetBound] : undefined;
  const ran = budget ?? (exhausted?.bound === "tool_calls" ? "it reached the limit on how many steps it may try" : "it reached the limit on how many decisions it may make");
  const refused = refusedOnWords(refusedSteps);
  return refused ? `${ran} ${refused}` : ran;
}

/** The most steps a budget ending names by their words; the rest are counted. */
const REFUSED_NAMED = 2;
/** The most characters of one refused step's words quoted. */
const REFUSED_STEP_WORDS = 80;

/**
 * What a candidate build's latest refused submission was refused for, from the
 * refused steps its failure carries, in words that follow a budget's ("it
 * reached its spending limit ..."): why, in each issue's own words, where its
 * code has some (`automationStudioActivityIssueWords`), else which steps were
 * refused, named by the model's own words. Nothing when it carries none.
 */
function refusedOnWords(refusedSteps: unknown): string | undefined {
  const steps = (Array.isArray(refusedSteps) ? refusedSteps : []).filter((entry): entry is { step: string; code?: unknown; line?: unknown; path?: unknown } =>
    Boolean(entry) && typeof entry === "object" && typeof (entry as { step?: unknown }).step === "string" && Boolean((entry as { step: string }).step.trim()));
  if (!steps.length) return undefined;
  const issues: AutomationStudioActivityIssue[] = steps.map((step) => ({
    code: typeof step.code === "string" ? step.code : "", step: step.step,
    ...(typeof step.line === "number" ? { line: step.line } : {}), ...(typeof step.path === "string" ? { path: step.path } : {})
  }));
  const reasons = automationStudioActivityIssueWords(issues, true, true).reasons;
  if (reasons.length) return `while the Flow it wrote was still being refused, the last time because ${joined(reasons)}`;
  const named = steps.slice(0, REFUSED_NAMED).flatMap((step) => {
    const words = automationStudioActivityReasonText(step.step, REFUSED_STEP_WORDS)?.replace(/[.!?]+$/u, "").trim();
    return words ? [`'${words}'`] : [];
  });
  if (!named.length) return "while the Flow it wrote was still being refused";
  const more = steps.length - named.length;
  const which = joined(more > 0 ? [...named, more === 1 ? "one more step" : `${more} more steps`] : named);
  return `while the Flow it wrote was still being refused at ${steps.length === 1 ? "the step" : "the steps"} ${which}`;
}

/** Each budget a build can run out of, in words that finish "failed: ...". */
const BUDGET_WORDS: Readonly<Record<string, string>> = Object.freeze({
  cost: "it reached its spending limit",
  tokens: "it reached the limit on how much the model may read and write for one build",
  duration: "it ran out of time",
  calls: "it reached the limit on how many times it may ask the model",
  iterations: "it reached the limit on how many decisions it may make"
});

/**
 * A project build's supervisor ending, by the issue code its failure carries
 * (`service/project-build/run.ts`), in words that finish "failed: ...".
 * Crossborder `run-mv8c76i3-61b9ca89` ended partial and the person read "The
 * build failed: what the model wrote could not be used", its stage's words,
 * since the code it fails under is the stage's own: the model wrote nothing
 * unusable. Its ending is said for what it was (t595), in a person's words:
 * the person never met a supervisor, and read "the supervisor ended it
 * because it could not finish the Flow" (t567 lane 4).
 */
const SUPERVISOR_ENDING_WORDS: Readonly<Record<string, string>> = Object.freeze({
  "project.build_partial": "FluxIQ stopped with the Flow only partly built",
  "project.build_blocked": "FluxIQ could not finish the Flow"
});

/**
 * A project build its time limit stopped (`service/project-build/run.ts`), in
 * words that finish "failed: ...", ahead of the supervisor's: the limit ended
 * it, not the supervisor. Everything-store `run-mv8id5vg` was stopped by its
 * time limit, carried `project.build_time_limit` beside `project.build_blocked`,
 * and the person read "the supervisor ended it because it could not finish the
 * Flow" (t601). What was tested and what is left is the build's own chat row
 * beside it, which knows its trials; these words know only the codes.
 */
const TIME_LIMIT = "project.build_time_limit";
const TIME_LIMIT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  "project.build_partial": "it reached its time limit before a whole test of the Flow passed, with only part of the Flow built",
  "project.build_blocked": "it reached its time limit before a whole test of the Flow passed"
});

function supervisorEndingWords(diagnostic: Diagnostic | undefined): string | undefined {
  const codes = Array.isArray(diagnostic?.issueCodes) ? diagnostic.issueCodes : [];
  if (codes.includes(TIME_LIMIT)) {
    const outcome = codes.find((entry): entry is string => typeof entry === "string" && Object.hasOwn(TIME_LIMIT_WORDS, entry));
    return outcome ? TIME_LIMIT_WORDS[outcome] : "it reached its time limit before a whole test of the Flow passed";
  }
  const code = codes.find((entry): entry is string => typeof entry === "string" && Object.hasOwn(SUPERVISOR_ENDING_WORDS, entry));
  if (!code) return undefined;
  // Why the supervisor ended it, its screened reason (`endedBecause`, t649): the person read that it ended and never why.
  // Never opening on the ending again: "could not finish the Flow: I could not finish this" (t753).
  const why = typeof diagnostic?.endedBecause === "string" ? automationStudioProjectBuildReasonUnrepeated(diagnostic.endedBecause).replace(/[.\s]+$/u, "") : "";
  return why ? `${SUPERVISOR_ENDING_WORDS[code]}: ${lowerFirst(why)}` : SUPERVISOR_ENDING_WORDS[code];
}

/**
 * "The item can't be added" reads "the item can't be added" after a colon; a
 * word with a capital inside ("FluxIQ", "URL") stays, and so does the pronoun
 * "I" ("I'm", "I've"): job-board `run-mvgo9wzn-fad4e050` read "... finish the
 * Flow: i could not finish" (t741 B5).
 */
function lowerFirst(sentence: string): string {
  const word = /^\S+/u.exec(sentence)?.[0] ?? "";
  if (/^I(?:['’][a-z]+)?[,;:.!?]?$/u.test(word)) return sentence;
  return /\p{Lu}/u.test(word.slice(1)) ? sentence : `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}


/**
 * A provider that answered with an unsuccessful status and no record of what it said: it was reached, so the
 * provider-request stage's "could not be reached" is not said of it (t1093).
 */
const ANSWERED_WITH_AN_ERROR = "the model provider answered the request with an error";

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

/** What the person can do next, closing an answer whose ending its row told (`./build.ts`, t753). */
export const AUTOMATION_STUDIO_CONVERSATION_TOLD_NEXT = "You can ask me to build it again.";

/** A cause `automationStudioConversationCallCause` wrote: "<what> failed: <why>", or "<what> could not finish. <ending>". */
const CALL_CAUSE = /^[a-z][A-Za-z ]* (?:failed: |could not finish\. )/u;

function joined(steps: readonly string[]): string {
  if (steps.length <= 1) return steps[0] ?? "";
  return `${steps.slice(0, -1).join(", ")} and ${steps[steps.length - 1]}`;
}
