// Replaying the draft before it may be proposed, and the verdict that decides.
//
// **The defect this closes.** A build explored, every action it took came back
// `succeeded`, and it proposed a Flow made of exactly those actions -- which is
// the whole design, and it is still not enough. A live build did that and the
// Flow's extraction then read **nothing** where the exploration had read
// sixteen rows (`run-mudavyub-d34e3c9b`); another built a Flow that needed a
// paid repair the first time it ran (`run-muddtosq-b92a4d5c`). Both were
// proposed with nothing wrong in the record, because "each step worked when I
// took it" and "these steps work as a Flow, from the beginning, in order" are
// different claims, and only the second one is what ships.
//
// So the draft is run again before it may be proposed: the target is put back
// the way the first step found it, every step the draft proposes is run in
// order with the argument the Flow will run it with, and **no model is
// attached** -- the loop makes not one provider call for any of it. That is the
// same proof the Lab takes of a repair (`flow-lane/repair/replay-repair.ts`),
// taken while the model is still there to act on it.
//
// **The rule.** A proposal is refused until the draft has replayed clean. The
// refusal is an ordinary issue the loop already knows how to feed back, so the
// model amends the draft and finishes again rather than the build dying.
//
// **When, in the build's lifecycle (user, 2026-09-30).** This replay is the
// judgement phase: the test run once the model says the Flow is ready and the
// completion check has accepted it, and again after each repair. It is never
// part of the live phase -- exploring and writing the draft -- so a completion
// the check refuses, and a continued build, replay nothing
// (`../llm/evidence-loop/completion-attempt.ts`, `../llm/evidence-loop/resume.ts`).
// A refused test leaves the page where it broke, which is where live repair
// starts.
//
// **What Core knows and what it does not.** Core knows which steps the draft
// proposes, in which order, and what each ran with; it knows nothing about
// targets, pages or state. So the two things a replay needs from the world --
// putting the target back, and saying whether a step reproduced what it did --
// are the caller's, carried on the step opaquely (`replay` on
// `AutomationStudioFlowDraftStep`) and answered in the closed vocabulary below.
//
// **Three ways a step can fail to replay, and they are not the same failure.**
//
//   failed          -- it did not run. The Flow would not run it either.
//   changed         -- it ran and produced nothing where it produced something.
//                      The step before it left the target somewhere else.
//   unreproducible  -- the step's target was not there when it was run again,
//                      and the replay was not standing on the page the step
//                      acted on: the draft's earlier steps no longer reach it.
//
// A target missing from the very page the step acted on is not one of these.
// That is the site remembering what the step did -- a consent banner answered
// once stays answered -- and the host answers it `remembered`, which passes
// and keeps the step in the Flow (`./site-memory.ts`). Until t195-w20b both
// were one answer, `unreproducible`, and the refusal offered to drop the step,
// which built Flows that stopped at the wall the first time they ran.
//
// **All three block, every time.** An unreproducible step used to be a question
// asked once: a model told about it that finished again with the step kept had
// "answered", and the step stopped blocking. Live builds showed what that
// answer was worth. Run 18 (`run-munpwa5r-e7aefe04`) was refused at completion
// 46 for step 26, finished again unchanged at 47, had its dry run pass on the
// waved step, and completion 48 was accepted on that cached verdict without
// replaying -- with the add-to-cart step replaying on the search results page,
// because an amendment had withdrawn the steps that reach the product page.
// Run 21 (`run-muntufao-7b7bc04a`) "passed" dry run 5 at decision 64 with step
// 38 unreproducible; run 33 (`run-munwwkwq-064c4203`) waved two such steps
// through at decisions 61-64. Insisting is not evidence either way, so it is no
// longer an answer. What a step that is not always there *is* answered by is
// the draft saying so: `optional`, or `only_if` on a check (`./routing.ts`),
// which exempts it through the verdict's `conditional` set. A step dropped,
// exploratory or that did not work is not proposed, so it is not replayed.
//
// **One exception, proved rather than insisted on.** A step whose target was
// not there, that does none of the person's acts, and without which every
// later step replayed is made optional by the replay itself, when that is all
// that stood in the way (`./sometimes-present.ts`): a cookie banner the build
// answered is not shown again on a reset that keeps site data, and one paid
// decision to say "optional" was what t194's run `run-mup2u8o3-6697c4be` could
// not afford.
//
// **A step whose effect lasts is checked, not run (decision D1).** The reset
// is a navigation: it never clears site data or logs the person out, so what
// the site remembers stays remembered, and replaying a save or an add would do
// it to the person's real account again. Such a step is verified instead --
// its target could take the action now, or its effect is already in place --
// and the steps after it are still run (`./verify-only.ts`). A step lasts when
// it declares so, or when it does an act the person's instruction asks to last,
// whatever it declared (t174-w83).

import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioFlowDraftExcusedWords, type AutomationStudioFlowDraftExcusedReason } from "./excused.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsProposed } from "./step.ts";
import { automationStudioFlowDraftPathToStep } from "./path-to-step.ts";
import { automationStudioFlowDraftStepById } from "./routing.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE } from "./site-memory.ts";
import { automationStudioFlowDraftReplayOutcomeWord } from "./verify-only.ts";

/** The entry a dry run's verdict is shown to the model under. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID = "core.dry_run";

/** The entry the page a replay broke on is shown under, beside the verdict. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID = "core.dry_run.page";

/** The issue a refused dry run is counted under, beside each step's own code. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE = "llm_evidence_loop.dry_run_refused";

/** How one step of the draft answered when it was run again. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_STATUSES = ["replayed", "failed", "changed", "unreproducible"] as const;

export type AutomationStudioFlowDraftReplayStatus = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_STATUSES)[number];

/**
 * What a step carries so it can be run again. Both fields are the caller's own
 * and Core reads neither.
 *
 * `from` is how to put the target back the way this step found it; only the
 * first proposed step's is ever used, because that is where a replay starts.
 * `produced` is what the step produced, handed back to the caller on the replay
 * so it -- not Core -- can say whether the replay reproduced it.
 */
export type AutomationStudioFlowDraftStepReplay = { from?: JsonObject; produced?: JsonObject };

/** One step's answer to being run again. */
export type AutomationStudioFlowDraftReplayOutcome = {
  /** The step's position in the draft when the replay ran. */
  step: number;
  /**
   * The step's own name, which a position stops being the moment the draft is
   * reordered (`./routing.ts`). Carried so a verdict can be read against what
   * the step says about when it runs.
   */
  stepId?: string;
  /** What was run, under the caller's own name for it. */
  actionId: string;
  status: AutomationStudioFlowDraftReplayStatus;
  /**
   * The caller's code for the answer. Read only to tell the two answers to a
   * check apart (`./verify-only.ts`); every other code is carried unread.
   */
  resultCode?: string;
  /**
   * `verify` when the step was checked rather than run again, because running
   * it would have repeated a lasting effect (`./verify-only.ts`). Absent, it
   * was run again.
   */
  mode?: "verify";
  /**
   * The position of the verified step before this one whose effect the dry run
   * withheld and whose effect this step may have needed -- one that moved the
   * target, or one that would move money, delete, or send or publish -- set
   * only on a step that then did not replay (`./verify-only.ts`). Such a step
   * does not refuse the proposal.
   */
  withheldBy?: number;
  /**
   * Set when the step was first looked for on another page, after a step that
   * was not done again, and was asked again on its own page
   * (`./site-memory.ts`). Its status, code and mode are that second answer.
   */
  reanchored?: true;
  /**
   * Set on the step's own record when this replay found it missing, proved the
   * Flow did not need it, and so made it optional (`./sometimes-present.ts`).
   * It is why an optional step that the model never marked is optional.
   */
  madeOptional?: true;
  /**
   * Set on a step of a repeat the test ran as the Flow would: one entry per
   * pass, once per row its list returned in this test, or once per time its
   * check held (`../llm/node-tools/replay-span.ts`, t252). The status above is
   * its first pass that did not pass, else `replayed`; an empty list is a list
   * with no rows in the test, which ran the step zero times. Absent, the step
   * was sent once, as every step was before t252. A step with passes is never
   * excused as one the Flow does not always run (see the verdict).
   */
  passes?: AutomationStudioFlowDraftReplayPass[];
  /**
   * Set on a step that did not replay and that does not stand in the way of
   * the proposal, naming why: the draft says the Flow does not always run it
   * (`./routing.ts`), or it needed what a verified step's withheld effect
   * would have made (`withheld`). Said wherever the test is shown, so a step
   * the Flow passes over is never read as one to fix or remove (`./excused.ts`).
   */
  excused?: AutomationStudioFlowDraftExcusedReason;
};

/** One pass of a repeated step in a test: which pass, how it answered, and the caller's code. */
export type AutomationStudioFlowDraftReplayPass = { pass: number; status: AutomationStudioFlowDraftReplayStatus; resultCode?: string };

/** One whole replay of the draft. */
export type AutomationStudioFlowDraftDryRun = {
  /** 1 for the first, so a reader counts them the way an operator would. */
  attempt: number;
  /** Whether the target could be put back at all. A reset that failed replays nothing. */
  reset: "ok" | "failed";
  outcomes: AutomationStudioFlowDraftReplayOutcome[];
  /** Provider calls this replay cost. Always zero: no model is attached. */
  providerCalls: 0;
  /** Whether the draft may be proposed on this verdict alone. */
  ok: boolean;
};

/**
 * Whether this draft can be dry-run at all.
 *
 * Every proposed step has to say what it would be run again with, and the first
 * one has to say how to get back to where it started. A draft that says neither
 * is a caller that does not replay -- an older host, a domain whose actions are
 * not repeatable -- and the gate simply does not apply to it, rather than
 * refusing every build it makes.
 */
export function automationStudioFlowDraftReplayable(steps: readonly AutomationStudioFlowDraftStep[]): boolean {
  const proposed = steps.filter(automationStudioFlowDraftStepIsProposed);
  if (!proposed.length) return false;
  if (!proposed.every((step) => step.ranWith !== undefined && step.replay !== undefined)) return false;
  return automationStudioFlowDraftReplayFrom(steps) !== undefined;
}

/** Where a replay of this draft starts: what the first proposed step found. */
export function automationStudioFlowDraftReplayFrom(steps: readonly AutomationStudioFlowDraftStep[]): JsonObject | undefined {
  return steps.filter(automationStudioFlowDraftStepIsProposed)[0]?.replay?.from;
}

/**
 * What a clean verdict is a verdict *about*: the proposed steps and the
 * arguments they would run with, in order.
 *
 * A draft that has changed since it replayed clean has not replayed clean, so
 * the signature is what a second completion is compared against. What is in it
 * is what changes the Flow -- which steps, in what order, with what argument --
 * and nothing that changes without the Flow changing, such as the iteration a
 * step was decided in or the call that ran it.
 */
export function automationStudioFlowDraftReplaySignature(steps: readonly AutomationStudioFlowDraftStep[]): string {
  return JSON.stringify(steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => [step.actionId, step.ranWith ?? step.input]));
}

/**
 * The verdict one replay makes.
 *
 * `conditional` is the ids of the steps a Flow built from this draft would not
 * always run (`./routing.ts`). A replay runs every proposed step once, in
 * order, so a step the Flow takes only in some situations may legitimately not
 * run in the situation the replay is in -- and refusing the proposal for that
 * would refuse exactly the Flow the model was asked to write. This is the
 * honest closure of the question `unreproducible` used to ask: a dismissal the
 * site remembers is not a step the model gets through by insisting, but one the
 * Flow itself handles. Every other step that did not replay refuses the
 * proposal, whatever the model was told about it before.
 *
 * **A repeat the test ran is not excused (t252).** A repeated step is in
 * `conditional` because a replay used to send it once, on the explored row. A
 * step that carries `passes` was run once per row, as the Flow runs it, so a
 * pass that did not replay is the Flow failing -- unless a withheld effect is
 * why (`withheldBy`, `./verify-only.ts`), which excuses it as it does any step.
 */
export function automationStudioFlowDraftDryRunVerdict(input: {
  attempt: number;
  reset: "ok" | "failed";
  outcomes: readonly AutomationStudioFlowDraftReplayOutcome[];
  conditional?: ReadonlySet<string>;
}): AutomationStudioFlowDraftDryRun {
  const outcomes = input.outcomes.map((outcome) => ({ ...outcome }));
  const conditional = input.conditional ?? new Set<string>();
  const excused = (outcome: AutomationStudioFlowDraftReplayOutcome): boolean => outcome.stepId !== undefined && conditional.has(outcome.stepId)
    && (outcome.passes === undefined || outcome.withheldBy !== undefined);
  const blocking = outcomes.filter((outcome) => !excused(outcome) && automationStudioFlowDraftReplayOutcomeBlocks(outcome));
  return {
    attempt: input.attempt,
    reset: input.reset,
    outcomes,
    providerCalls: 0,
    ok: input.reset === "ok" && !blocking.length
  };
}

/**
 * Whether one outcome stands in the way of a proposal: any answer but
 * `replayed`. An `unreproducible` step is not let through for having been
 * reported before (see the header).
 */
export function automationStudioFlowDraftReplayOutcomeBlocks(outcome: AutomationStudioFlowDraftReplayOutcome): boolean {
  return outcome.status !== "replayed";
}

/**
 * How one step is named among those an earlier dry run already told the model
 * did not replay. It marks a feedback line `again` and never changes a verdict.
 */
export function automationStudioFlowDraftReplayOutcomeKey(outcome: AutomationStudioFlowDraftReplayOutcome): string {
  return `${outcome.step}:${outcome.actionId}`;
}

/** The issue codes a refused dry run is counted and fed back under. */
export function automationStudioFlowDraftDryRunIssueCodes(verdict: AutomationStudioFlowDraftDryRun): string[] {
  const codes = verdict.outcomes
    .filter((outcome) => outcome.status !== "replayed")
    .flatMap((outcome) => [
      outcome.resultCode ?? `core.replay.${outcome.status}`,
      // Looked for on its own page too, and still did not replay there.
      ...(outcome.reanchored ? [AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE] : [])
    ]);
  return [...new Set([
    AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
    ...(verdict.reset === "failed" ? ["core.replay.reset_failed"] : []),
    ...codes
  ])];
}

const DRY_RUN_INSTRUCTION = "You said the Flow is ready, so it was tested: run once from the beginning with no model attached, the way the finished Flow will run. The target was put back the way your first step found it, and every step you kept was run in order with the argument the Flow will use. "
  + "A step that does not replay is a step the Flow cannot rely on, so the Flow is not proposed until they all do. Repair it live from where the test stopped -- the draft is not run from the beginning again until you say it is ready again. "
  + "failed: the step did not run this time. Rerun it with a corrected argument (amend_draft rerun), or run the step it needed first and keep that one too. "
  + "changed: it ran, and produced nothing where it produced something before -- almost always the step before it left the target somewhere else, so correct the order or the earlier step rather than this one. "
  + "unreproducible: the step's target was not there, and the test was not on the page the step acted on: the steps before it no longer reach that page. Check that they still get there. "
  // The site's memory is not the draft's fault (`./site-memory.ts`). The
  // finished Flow runs on a site that has not seen any of this, so a step
  // dropped for it is a wall the Flow stops at (t195-w19a/b/d/e).
  + "remembered: the step's target was gone from the very page it acted on, because the site remembers what you did while exploring -- a consent banner answered once stays answered, a sign-in wall passed once stays passed -- and the test never clears what the site remembers. It passes, and it stays in the Flow exactly as it is: the finished Flow runs on a site that has not seen it yet and needs it there. Do not drop, rerun or reorder a remembered step. "
  + "reanchored: true means the step was first looked for on another page, right after a step that was not done again (verified, present, remembered or afterWithheld), so the test went to the page the step acted on and tried it once more there; what the line shows is that second try. "
  // The honest answer to a step that is not always there. Before routing
  // existed the only answers were "insist" or "delete", and a live build's
  // dismissals were waved through unchecked under the first. Named here rather
  // than only in the draft entry because this refusal is where the model is
  // actually looking at the step that needs it.
  + "A step that is not always needed is not a step to insist on: say so instead, with amend_draft optional, and the Flow carries on when it is not there. Where you ran a check first, amend_draft only_if on this step runs it only when that check succeeded. "
  // Insisting used to be accepted the second time; runs 18, 21 and 33 shipped
  // or nearly shipped a step that did not replay that way (see the header).
  + "So a step that failed, changed or is unreproducible keeps the Flow from being proposed until it replays, is marked optional (or only_if on a check), or is dropped; finishing again with it unchanged is refused again. Drop it only if the Flow does not need it at all. "
  // The one case the replay answers itself (`./sometimes-present.ts`), said so
  // the model does not mark by hand what the next test would mark for it.
  + "An unreproducible step that does none of the acts, and without which every later step replayed, is made optional by the test itself once nothing else stands in the way. "
  + "again: true marks a step an earlier dry run already reported as not replaying. "
  // Decision D1: a lasting effect is never repeated (`./verify-only.ts`). The
  // model must not read a checked step as one that was done again.
  + "verified: the step changes something that lasts, so it was not run again, only checked that it could run now. present: the same kind of step, whose effect is already in place on the page it acted on, so it was not run either. Both pass. "
  // A step the test passed over is not one to repair (`./excused.ts`): the
  // judge of live run `run-murzln6g-11debe1d` asked to fix or remove one.
  + "excused: the step did not replay, and the Flow passes over it as written -- the line says why: optional, an interruption that was not there, a check, a fallback, a repeat, or a step that needed what a verified step would have done. It does not stand in the way: do not fix, rerun, reorder or drop it for this. "
  + "afterWithheld names the verified step before this one whose effect was withheld -- one that moved the page, or one that moves money, deletes, or sends or publishes, which the test never does -- so this step may have needed what that step would have done; a step marked with it does not stand in the way of the proposal on its own. "
  // t252: a repeat is run as the Flow runs it (`../llm/node-tools/replay-span.ts`).
  + "A step inside a repeat was run once for each item its list returned in this test, each time with that item and with its bound values filled in for it -- a lasting act is checked for each item, never done -- or, over a check, once each time the check held. passes says how many times it ran, and pass names the first time it did not replay, which is what its line shows; passes 0 means the list had no items in this test. "
  + "loop_bound: the list returned more items than the loop takes. unresolved_binding: a bound value had nothing to take it from -- a row field on a step outside the repeat, or one the item does not have -- so the step was not sent. "
  + "When the test could not read the list's items, the repeat ran once on the item you explored, as a step the Flow does not always run. "
  + "The target now stands where the replay ended.";

/**
 * What the model is shown of a refused dry run: the verdict, and what to do.
 *
 * `told` is the steps an earlier dry run of this build already reported as not
 * replaying, by `automationStudioFlowDraftReplayOutcomeKey`; such a step's line
 * says `again: true`, so the model can see it is being refused for the same
 * step a second time rather than a new one.
 *
 * `steps` is the draft the replay ran. Given it, a refusal whose first
 * unreproducible step ran, while exploring, on a page taken steps made names
 * those steps (`notInFlow`): run muqk4u32's refusals listed step 1 replayed and
 * 6-13 unreproducible, and the ×, the search and the listing that reach the
 * item page (3-5) had to be inferred from the draft (t174 F41).
 *
 * Given it too, a row that did not replay carries the page its step acted on
 * (`actedOn`, the step's `replay.from` as the host wrote it, read never): live
 * run `run-musq0b1m-0472cfa0` (Cause 6) refused 7-in-1 and Space Grey with rows
 * naming no page, while both ran on the search results and acted on the item
 * page.
 */
export function automationStudioFlowDraftDryRunFeedback(verdict: AutomationStudioFlowDraftDryRun, told: ReadonlySet<string> = new Set(), steps?: readonly AutomationStudioFlowDraftStep[]): JsonObject {
  const missing = steps ? notInFlow(verdict, steps) : undefined;
  return {
    ok: false,
    code: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
    attempt: verdict.attempt,
    reset: verdict.reset,
    steps: verdict.outcomes.map((outcome) => ({
      step: outcome.step,
      actionId: outcome.actionId,
      // `verified` or `present` for a step that was checked and not run
      // (`./verify-only.ts`), so the model never believes it was done again.
      replayed: automationStudioFlowDraftReplayOutcomeWord(outcome),
      ...(outcome.resultCode ? { resultCode: outcome.resultCode } : {}),
      ...(outcome.withheldBy !== undefined ? { afterWithheld: outcome.withheldBy } : {}),
      ...(excusedLine(outcome)),
      ...(outcome.reanchored ? { reanchored: true } : {}),
      ...automationStudioFlowDraftReplayPassWords(outcome),
      ...(outcome.status !== "replayed" && told.has(automationStudioFlowDraftReplayOutcomeKey(outcome)) ? { again: true } : {}),
      ...(steps && outcome.status !== "replayed" ? actedOnLine(outcome, steps) : {})
    })),
    ...(missing ? { notInFlow: missing } : {}),
    instruction: DRY_RUN_INSTRUCTION
  };
}

/**
 * A row's `actedOn`: the page its step acted on while exploring, from the step
 * the outcome is about -- by its id, which survives a move after the test, else
 * by the position it had -- or nothing when the step recorded none.
 */
function actedOnLine(outcome: AutomationStudioFlowDraftReplayOutcome, steps: readonly AutomationStudioFlowDraftStep[]): { actedOn?: JsonObject } {
  const step = (outcome.stepId !== undefined ? automationStudioFlowDraftStepById(steps, outcome.stepId) : undefined) ?? steps.find((each) => each.position === outcome.step);
  const from = step?.replay?.from;
  return from ? { actedOn: from } : {};
}

/** A feedback line's `excused`, for a step the test passed over. */
function excusedLine(outcome: AutomationStudioFlowDraftReplayOutcome): { excused?: string } {
  const words = automationStudioFlowDraftExcusedWords(outcome);
  return words ? { excused: words } : {};
}

/**
 * How a repeated step's passes are shown on its line: how many it ran, and the
 * first that did not pass. Nothing for a step sent once.
 */
export function automationStudioFlowDraftReplayPassWords(outcome: AutomationStudioFlowDraftReplayOutcome): JsonObject {
  if (!outcome.passes) return {};
  const blocking = outcome.passes.find((pass) => pass.status !== "replayed");
  return { passes: outcome.passes.length, ...(blocking ? { pass: blocking.pass } : {}) };
}

/**
 * The taken steps that changed the page on the way to the first unreproducible
 * step and are not in the Flow, said as what to do, or nothing when there are
 * none (`./path-to-step.ts`).
 */
function notInFlow(verdict: AutomationStudioFlowDraftDryRun, steps: readonly AutomationStudioFlowDraftStep[]): string | undefined {
  const unreached = verdict.outcomes.find((outcome) => outcome.status === "unreproducible");
  const step = unreached ? steps.find((candidate) => candidate.position === unreached.step) : undefined;
  if (!step) return undefined;
  const way = automationStudioFlowDraftPathToStep(steps, step).map((each) => each.position).sort((a, b) => a - b);
  if (!way.length) return undefined;
  const one = way.length === 1;
  const named = one ? `Step ${way[0]}` : `Steps ${way.slice(0, -1).join(", ")} and ${way[way.length - 1]}`;
  return `${named} changed the page on the way to step ${step.position} when you ran ${one ? "it" : "them"}, and ${one ? "is" : "are"} not in the Flow, so the test never reached the page step ${step.position} acted on: add ${one ? "it" : "them"} (amend_draft add).`;
}
