// What the loop says to a model that has started repeating itself, instead of
// stopping.
//
// **Why this exists.** Every no-progress guard in this loop was held to
// `maxIterations`, and on a Lab creation run `maxIterations` is the call budget
// itself, so no guard could fire before the calls ran out
// (`../../loop-limits/evidence-loop.ts` carries the numbers and the run). A
// stall therefore had exactly one outcome available to it -- the loop using its
// last call -- and the only lever anybody reached for was a bigger budget,
// which buys more repetition rather than less. `run-mulum3x7-18ceeb75` spent 22
// of its 34 paid decisions on answers it already held and ended with no Flow,
// with tokens and calls still unspent.
//
// **What it does instead.** A model that is repeating itself is not a model
// that needs to be stopped; it is a model that has not been told it is
// repeating itself and does not know what would count as finishing. So from the
// third step without progress the loop pushes this entry as the newest piece of
// evidence, and pushes it again on every further step, saying four things and
// nothing else:
//
//   1. nothing new has entered the evidence for N steps, and which tools keep
//      answering the same thing -- and that asking again for what it holds
//      withdraws looking until it acts, or that it now has;
//   2. what the draft already holds -- the steps that would be proposed if the
//      build finished now;
//   3. what happened the last time it tried to finish, by issue code, which is
//      the one thing standing between the draft it has and a Flow;
//   4. how many steps remain before the loop stops, and that finishing or doing
//      something it has not done are the two ways out.
//
// It is the loop's fourth refusal channel and says the same three things as the
// other three -- what happened, how close the loop is to stopping, what to do
// instead (`./answered-request.ts`) -- with one addition the others cannot
// make: those speak about one decision, and this speaks about the run of them.
//
// **It never ends the loop.** A push that does not fit the evidence budget is
// dropped and the loop goes on; a nudge is not worth an ending. Stopping stays
// with `maxStepsWithoutProgress`, five steps further on.
//
// **The stall is usually a symptom, and the redirection names the cause.** On
// `run-mulum3x7-18ceeb75` the spinning at iterations 13-19 and 21-33 followed
// one fact: at iteration 20 Core refused completion with
// `bootstrap.cannot_answer_instruction`, `recordProducerPresent: false` -- the
// instruction asked for a table and no step of the draft produced one. Every
// repeat after that was the model circling a gap it had been told about once,
// ten decisions earlier, and then never again, because the refusal left the
// evidence window and the loop's own count of refusals-in-a-row reset on the
// next tool call. So the loop keeps the latest completion check's answerability
// and its refusal codes until the model tries to finish again, and every
// redirection leads with what is still missing for the plan to answer the
// instruction. What the model already has is secondary; what it lacks is the
// point.
//
// Codes, identifiers and counts only -- no page text, no model words -- which
// is the same rule every evidence entry Core writes is held to. One exception,
// the checklist's own sentence about a step named for an act (`todoSaid`): it
// is Core's, and quotes only the control words the draft entry already shows.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopAnswerability } from "../evidence-loop/index.ts";

/** The evidence entry the loop's no-progress redirection arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID = "core.no_progress";

// Every repeating tool and every issue code is named: no count limit on what
// the model is shown (`../context-window.ts`).

const ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;

export type AutomationStudioLlmEvidenceStallRedirectInput = {
  /** Candidate discovery owns a submitted receipt, never the legacy accumulated draft. */
  discoveryOnly?: boolean;
  candidate?: { revision: number; digest: string } | undefined;
  /** A discovery-only loop's own submit and test tools, which its words name; the candidate's when absent (t537). */
  finishing?: { submit: string; test: string } | undefined;
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
  /** The tools whose latest answers gave the loop nothing it did not hold. */
  repeatingToolIds: readonly string[];
  /** Steps that would be proposed if the build finished now. */
  proposableSteps: number;
  /** Times the model has asked to finish, refused or not. */
  completionAttempts: number;
  /** What refused the latest attempt to finish, kept until the model tries again. */
  lastIssueCodes: readonly string[];
  /** Whether finishing is on the table at all this iteration. */
  canComplete: boolean;
  /** What the latest completion check found the plan could and could not answer, when one ran. */
  answerability?: AutomationStudioLlmEvidenceLoopAnswerability | undefined;
  /** Whether looking is withdrawn now, until an action runs (`../decision-handlers/look-withdrawal.ts`). */
  looksWithdrawn?: boolean | undefined;
  /**
   * The acts on the acts checklist that no step in the Flow does yet, by id
   * (`../loop-configuration.ts`, `draft.actsMissing`). What the build still owes,
   * which is what a redirect has to name rather than only what not to repeat.
   */
  actsMissing?: readonly string[] | undefined;
  /**
   * The acts checklist as the draft entry carries it (`../loop-configuration.ts`,
   * `draft.acts`): read for each missing act's `todo`, `step` and `todoSaid`,
   * so a redirect about an act a step already names corrects that step instead
   * of asking for a new one, or says, in the checklist's own words, what that
   * step did instead and where to name the act.
   */
  acts?: JsonValue | undefined;
};

/**
 * What the plan still lacks to answer the instruction, by Core's own reading of
 * the latest completion check -- or nothing when the check found no gap or has
 * not run. Only one gap exists in that reading today: the instruction asks for
 * a set of records and no step produces or saves one
 * (`../../flow-bootstrap/answerability/check.ts`).
 */
export function automationStudioLlmEvidenceStillMissing(answerability: AutomationStudioLlmEvidenceLoopAnswerability | undefined): "record_producer" | undefined {
  if (!answerability?.recordsRequested) return undefined;
  return answerability.recordProducerPresent || answerability.recordStorePresent ? undefined : "record_producer";
}

const RECORDS_MISSING = "Your last attempt to finish was refused because the instruction asks for a set of records and no step in your draft produces or saves one"
  + " (stillMissing: record_producer). That is what is missing, and nothing you have already run supplies it: repeating it cannot."
  + " Your next step is to run the node that reads those records -- the list the instruction is about, on the page where it is -- and keep that step in the draft."
  + " Complete only once the draft has it.";

/**
 * The redirection itself: what the model already has, what it is missing, and
 * that the way out is to finish the draft rather than to ask again.
 */
export function automationStudioLlmEvidenceStallRedirect(input: AutomationStudioLlmEvidenceStallRedirectInput): JsonObject {
  const stepsLeft = Math.max(0, input.maxStepsWithoutProgress - input.stepsWithoutProgress);
  const issueCodes = [...new Set(input.lastIssueCodes.filter((code) => ISSUE_CODE.test(code)))];
  const stillMissing = automationStudioLlmEvidenceStillMissing(input.answerability);
  return {
    ok: false,
    code: "llm_evidence_loop.no_progress",
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    stepsLeftBeforeStopping: stepsLeft,
    repeatingToolIds: [...new Set(input.repeatingToolIds.filter((toolId) => ISSUE_CODE.test(toolId)))],
    ...(input.discoveryOnly ? { authoringMode: "candidate", ...(input.candidate ? { candidate: { ...input.candidate } } : {}) } : { draftStepsSoFar: input.proposableSteps }),
    completionAttempts: input.completionAttempts,
    ...(issueCodes.length ? { lastCompletionIssueCodes: issueCodes } : {}),
    ...(stillMissing ? { stillMissing } : {}),
    ...(input.looksWithdrawn ? { looksWithdrawn: true } : {}),
    ...(actsMissing(input).length ? { actsMissing: actsMissing(input) } : {}),
    instruction: instruction(input, stepsLeft, issueCodes.length > 0, stillMissing)
  };
}

/** Every missing act and choice id that is an id. */
function actsMissing(input: AutomationStudioLlmEvidenceStallRedirectInput): string[] {
  return [...new Set((input.actsMissing ?? []).filter((id) => /^a[1-9][0-9]{0,2}(?:\.[a-z]{1,16})?$/u.test(id)))];
}

/**
 * The step the checklist says names one act, and why it is not done, or
 * nothing when no step names it (`todo: no_step_added`) or the checklist is
 * absent. An act's id is matched on the act and on each of its choices.
 * Codes and positions, as the checklist itself carries them, and its sentence
 * about the step (`todoSaid`) when it is a string (week report W1).
 */
function namedStep(acts: JsonValue | undefined, id: string): { step: number; todo: string; said?: string } | undefined {
  if (!Array.isArray(acts)) return undefined;
  const items = acts.flatMap((item) => (isObject(item) ? [item, ...(Array.isArray(item.choices) ? item.choices.filter(isObject) : [])] : []));
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return undefined;
  const { step, todo, todoSaid } = item;
  if (typeof step !== "number" || !Number.isSafeInteger(step) || step < 1) return undefined;
  if (typeof todo !== "string" || todo === "no_step_added" || !ISSUE_CODE.test(todo)) return undefined;
  const said = typeof todoSaid === "string" ? todoSaid.trim() : "";
  return { step, todo, ...(said ? { said } : {}) };
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The owed id the note sends the model to next: the first owed act's own owed
 * choice before the act, since the press that does an act commits the choices
 * made before it. Live run `run-muwaq9w3-baaa4e19`: with a2.quantity owed the
 * note said "the one that does a2", the model pressed Add to cart at quantity
 * 1, and then tried a repeat for the second pack.
 */
function nextOwed(owed: readonly string[]): string {
  const first = owed[0]!;
  const act = first.split(".")[0]!;
  return owed.find((id) => id.startsWith(`${act}.`)) ?? first;
}

/**
 * Whether Core's own record says the evidence covers every act the
 * instruction asks for: the acts checklist was read (`actsMissing` given, from
 * `../../flow-bootstrap/instructed-acts/`) and owes nothing, and the latest
 * completion check names no gap. Only then does a candidate stall say "submit".
 * No record is not coverage: live run `run-mv6bg7ac-d24d91ce` was told to
 * submit with no candidate and no record, while one act's object was still the
 * wrong item, and it submitted that item.
 */
function candidateCovered(input: AutomationStudioLlmEvidenceStallRedirectInput, stillMissing: "record_producer" | undefined): boolean {
  return input.actsMissing !== undefined && actsMissing(input).length === 0 && !stillMissing;
}

/**
 * The no-candidate stall that Core cannot show is covered: routes not yet
 * tried, never "submit now". Abstract on purpose; its one example is a kind of
 * site no realistic scenario uses.
 */
function untriedRoutes(owed: readonly string[], stillMissing: "record_producer" | undefined): string {
  const gap = owed.length
    ? `No candidate has been accepted, and the acts checklist still has ${owed.join(", ")} not shown done (actsMissing).`
    : stillMissing
      ? "No candidate has been accepted, and the instruction asks for a set of records no step gathered yet (stillMissing: record_producer)."
      : "No candidate has been accepted, and nothing yet shows every act the instruction asks for done on the right item.";
  return `${gap} Going back to pages already seen, or running the same search again, will not change that, and submitting now would submit what is still missing.`
    + " Take a route not yet tried: a control on the current page you have not used (an option or variant choice, an \"Options\", \"More\" or \"See all\" link, a related or similar items section), a page search with other or fewer words, or going back to a listing and opening a result you have not opened."
    + " For example, on a library catalogue where the title shown is the wrong edition, its \"Other editions\" link or a search for the title without the edition words reaches the right one."
    + " Submit the whole candidate only once the evidence shows every act the instruction asks for done, using steps that were seen working, then test its returned revision and digest. Do not complete an untested candidate.";
}

function instruction(input: AutomationStudioLlmEvidenceStallRedirectInput, stepsLeft: number, refused: boolean, stillMissing: "record_producer" | undefined): string {
  if (input.discoveryOnly) {
    const next = input.candidate
      ? `The latest accepted candidate has receipt ${JSON.stringify(input.candidate)}. Use ${input.finishing?.test ?? "core.test_candidate"} with that exact revision and digest if its trial has not answered yes. Complete only after yes for that exact receipt; change and resubmit only when its feedback names a cause in the Flow.`
      : candidateCovered(input, stillMissing)
        ? "No candidate has been accepted. Use the evidence already gathered, correct any named submission issues and submit the whole candidate, then test its returned revision and digest. Do not complete an untested candidate."
        : untriedRoutes(actsMissing(input), stillMissing);
    const looking = input.looksWithdrawn ? " Looking is withdrawn until an action runs; candidate submission and testing remain the finishing path." : "";
    return `The last ${input.stepsWithoutProgress} steps added no new evidence. Repeating the same request returns the answer already held.${looking} ${next} ${stepsLeft} more step(s) without progress stop this build.`;
  }
  // What is missing leads, because it is the only sentence here that says what
  // to do next rather than what not to do again.
  const said = stillMissing ? [RECORDS_MISSING] : [];
  const owed = actsMissing(input);
  if (owed.length) {
    const id = nextOwed(owed);
    const named = namedStep(input.acts, id);
    // "Run it" only when no step names the act. Where one does, the checklist
    // says why it is not done, and running another step for the act is what
    // live run 36 did on this note: it confirmed a request its listing had left
    // out (E36). Except where the step named only opened the page of the act's
    // choices (run `run-mux6pndp-16feb842`): no correction of it does the act,
    // and the press after the choices is exactly another step for it.
    // Where the checklist says what the step did instead and where to name the
    // act (`todoSaid`), that sentence is said in place of both (week report W1:
    // "correct step 5 ... Do not run another step for a1" of a1 on the press of
    // "Spain" forbade naming a1 on the Add to cart press, the step that does it).
    const next = named?.said !== undefined
      ? ` Step ${named.step} names ${id}, and the checklist says it is not done (${named.todo}): ${named.said}`
      : named?.todo === "step_only_opens_its_choices"
      ? ` Step ${named.step} only opened the page where ${id}'s choices are made and does not do ${id}: on that page, after its choices, run the step that does ${id} and add it with act ${id}.`
      : named
        ? ` Step ${named.step} already names ${id}, and the checklist says it is not done because ${named.todo}: correct step ${named.step} for that reason. Do not run another step for ${id}, and never act yourself on an item your listing left out.`
        : ` Your next step is the one that does ${id}: run it and add it with act ${id}.`;
    said.push(`The acts checklist still has ${owed.join(", ")} not done by any step in your Flow (actsMissing). Going back to a page you have already been on, or pressing what you already pressed, does not do them.`
      + `${next} Complete only once no act is missing.`);
  }
  said.push(
    `The last ${input.stepsWithoutProgress} steps told you nothing you did not already have.`,
    input.repeatingToolIds.length
      ? `The tools named in repeatingToolIds are answering with what they already answered; asking them again will return the same thing again.`
      : `Repeating a request returns the result you already hold.`,
    // What ignoring this costs (`../decision-handlers/look-withdrawal.ts`): said
    // before it happens, and said again once it has.
    input.looksWithdrawn
      ? `You asked again for what you already hold right after being told so, so looking is withdrawn until you run an action: no look is offered, and one asked for is refused.`
      : `Asking again for what you already hold withdraws looking until you run an action.`,
    input.proposableSteps > 0
      ? `Your draft already holds ${input.proposableSteps} step(s) that would be proposed if you finished now. Read the draft entry and build on it.`
      : `Your draft holds no step that could be proposed yet, so finishing now would produce nothing. The next thing to do is run a step that produces what the instruction asks for.`
  );
  // With a gap named above, "complete now" would contradict it, so neither of
  // these is said.
  if (!stillMissing && refused) {
    said.push(`You have tried to finish ${input.completionAttempts} time(s) and lastCompletionIssueCodes says what refused the last one.`
      + ` That refusal is the only thing between your draft and a finished Flow: correct exactly it.`);
  } else if (!stillMissing && !owed.length && input.completionAttempts === 0 && input.proposableSteps > 0 && input.canComplete) {
    said.push(`You have not tried to finish yet. If the draft answers the instruction, complete now.`);
  }
  const way = stillMissing || owed.length ? "Do the missing step." : "Do something you have not done, or complete.";
  said.push(stepsLeft > 0
    ? `${way} ${stepsLeft} more step(s) without progress and this exploration stops with no Flow.`
    : `${way} This exploration stops on the next step without progress.`);
  return said.join(" ");
}
