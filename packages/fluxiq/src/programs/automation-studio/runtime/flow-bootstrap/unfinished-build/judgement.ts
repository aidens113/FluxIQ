// Phase 2 for a Flow a round left unfinished: test it, and judge what it does.
//
// **The user's lifecycle (2026-09-30), and the gap this closes.** A build
// explores live and authors its Flow; once the model says the Flow is ready it
// is tested and judged; then it is repaired, declared finished, or -- only if
// there is absolutely no way -- declared not doable. A build that never said
// its Flow was ready skipped straight to an error code: 30 live runs ended
// that way with no test, no judgement and no repair (audit A3, cause 1). So
// what such a round leaves is tested and judged here exactly as a Flow the
// model called ready would be, and the repair works from the judgement.
//
// **The test is the one the loop runs**, handed in by the caller
// (`../../llm/node-tools/dry-run-gate.ts`): the Flow run from where it starts,
// with no provider call, each mutating step verified rather than repeated
// where it has a lasting effect. A replay from the start belongs to judgement
// and repair, never to exploration (user, 2026-09-30), and this is judgement.
//
// **The judgement is the checklist's.** What is done and what is still to do
// is read by the same rule the completion check applies
// (`../instructed-acts/checklist.ts`), acts and their choices alike, so the
// repair is told exactly what a completion would be refused for.
//
// **A finished round is judged by the judge (t195).** A Flow the model said
// was ready and whose test passed is judged against the instruction from what
// that test actually did (the caller's `judge`, `./phases.ts`). One not judged
// to do what was asked is made a judgement here too
// (`automationStudioFlowBootstrapJudgeFinished`), carrying the judge's own
// account, so it takes the same repair path as a round that stopped short:
// a `no`, and since the user's rule of 2026-10-02 -- a build finishes only on
// a judged success of the Flow as it finally stands -- an unsure verdict, one
// not judged, and a yes about another version of the Flow or about no test.
// Such a Flow is said untested unless the verdict was about a test of this
// very Flow (its `flowSignature`): what ran was another Flow, or nothing. The
// checklist is still read for it, as information: the Flow is judged on what
// its test does.
//
// **The judge's word on whether it can still be done is kept (t195-w37).** A
// `no` carries `stillAchievable` where the judge gave it: the one thing that
// ends a build "not doable" (`./phases.ts`). Live run `run-murwcaj0-40e56557`
// had a judge say "still achievable" twice, and the build ended "I found no
// way to" all the same, because the judgement never carried it.
//
// **A `no` carries Core's lines on the rows (t274-c25b).** Live run
// `run-muw60j7c-bb7c9a62`'s test judges said yes over three pairs of earbuds the
// name condition alone left out; Core now takes such a yes as a no
// (`../../result-verification/verdict.ts`), and its fix lines and its check of
// the rows (`fix`, `checked`) are what name them. The judgement kept only the
// finding code, so the repair was told a code and no row; now it keeps both.
//
// **Steps the test cannot run are named (t194-w70).** A re-author or an extend
// seeds its draft from a stored Flow. A step carried from it that the test
// cannot run as saved -- changed since, declaring nothing, or with no captured
// start -- has nothing to run it with until it is rerun live
// (`not_run_in_this_build`, `../../flow-draft/full-run-required.ts`). Core never
// runs such a step itself, so a Flow holding one is not tested here, and its
// judgement says which they are (`notRunInThisBuild`): the round has no
// measurement, which `./phases.ts` never concludes "not doable" from, and the
// repair is told to rerun them (`../../llm/evidence-loop/resume.ts`). Live run
// murwcmx2's re-author was judged `not_tested` twice with nothing saying why,
// and ended not doable with the advised fix in its draft, never run.
//
// **An unchanged carried step is not one of them (t274-c4).** It holds a
// scheduled candidate, and the test runs it as the Flow saved it; the Merge an
// optional step joins at is passed through (`../../flow-draft/carried-step/`).
// Live run `run-muw60j7c-bb7c9a62` listed both here, every round was told to
// rerun steps 1-5, and the domain refused every rerun of the carried type step
// for naming no handle until the budget ran out. So such a Flow is tested here
// like any other, and the repair seed keeps each candidate (below), so the next
// round's test still runs those steps as saved.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepCarriedJoin } from "../../flow-draft/carried-step/index.ts";
import { automationStudioFlowDraftCopyScheduledCandidate } from "../../flow-draft/scheduled-candidate/index.ts";
import { automationStudioFlowDraftFlowSignature, automationStudioFlowDraftReplayOutcomeWord, automationStudioFlowDraftReplaySignature, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioInstructedActsNotDone, type AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type {
  AutomationStudioFlowBootstrapJudgeReading,
  AutomationStudioFlowBootstrapJudgedWrong,
  AutomationStudioFlowBootstrapJudgement,
  AutomationStudioFlowBootstrapTested,
  AutomationStudioFlowBootstrapTestVerdict,
  AutomationStudioFlowBootstrapUnfinishedStop
} from "./contracts.ts";
import { automationStudioFlowBootstrapStepsNotRunInThisBuild } from "./not-run.ts";

/**
 * What the caller's test answers: the loop's dry-run gate, over the steps it is
 * given. `judged` is set for a test the build's judge will read next -- the Flow
 * a round left when the judging reserve stopped it, or when it stopped short of
 * a completion (`./reserve-judging.ts`) -- so the caller hands what the test
 * observed to its judge; absent, it is the checklist's test alone.
 */
export type AutomationStudioFlowBootstrapUnfinishedTest = (steps: AutomationStudioFlowDraftStep[], options?: { judged: true }) => Promise<"cancelled" | "evidence_limit" | { issueCodes: readonly string[] } | undefined>;

/**
 * The Flow as a round left it, as a repair starts from it: only the steps in
 * the Flow, renumbered, each keeping its own id, the act it does and how to run
 * it again, and nothing of the call that took it or of a test before this one.
 *
 * A carried step still as the Flow saved it keeps its scheduled candidate: a
 * deep copy lends it none by itself (`../../flow-draft/scheduled-candidate/`),
 * and without it the next round's test could not run the step as saved and
 * would list it for a live rerun (t274-c4).
 */
export function automationStudioFlowBootstrapRepairSeed(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftStep[] {
  return steps.filter(automationStudioFlowDraftStepIsProposed).map((step, index) => {
    const copy = structuredClone(step);
    delete copy.callId;
    delete copy.replayed;
    copy.position = index + 1;
    copy.iteration = 0;
    if (step.scheduledCandidate !== undefined) {
      copy.scheduledCandidate = step.scheduledCandidate;
      automationStudioFlowDraftCopyScheduledCandidate(step, copy);
    }
    return copy;
  });
}

/**
 * Tests the Flow the round left and judges it. `cancelled` when the build was
 * stopped while the test ran; otherwise the judgement, and the seed the repair
 * starts from, carrying what the test found on each step it ran.
 */
export async function automationStudioFlowBootstrapJudgeUnfinished(input: {
  round: number;
  stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget";
  steps: readonly AutomationStudioFlowDraftStep[];
  lastIssueCodes: readonly string[];
  /** Absent for a round a budget stopped: nothing is run for a build that is ending. */
  test?: AutomationStudioFlowBootstrapUnfinishedTest;
  /** Whether these steps carry what a test needs (`automationStudioFlowDraftReplayable`). */
  replayable(steps: readonly AutomationStudioFlowDraftStep[]): boolean;
  checklist(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioInstructedActChecklistItem[] | undefined;
}): Promise<{ kind: "cancelled" } | { kind: "judged"; judgement: AutomationStudioFlowBootstrapJudgement; seed: AutomationStudioFlowDraftStep[] }> {
  const seed = automationStudioFlowBootstrapRepairSeed(input.steps);
  let tested: AutomationStudioFlowBootstrapTested = "not_tested";
  let testIssueCodes: string[] = [];
  // A carried routing join is passed through by the test, as the gate passes it (t274-c4).
  if (input.test && input.replayable(seed.filter((step) => !automationStudioFlowDraftStepCarriedJoin(step)))) {
    const refusal = await input.test(seed);
    if (refusal === "cancelled") return { kind: "cancelled" };
    if (refusal === "evidence_limit") testIssueCodes = ["llm_evidence_loop.evidence_limit"];
    else if (refusal) {
      tested = "replay_failed";
      testIssueCodes = [...new Set(refusal.issueCodes)];
    } else tested = "replayed_clean";
  }
  // A step named for an act is a claim; the same step working when the Flow
  // ran from its start is the nearest thing to a result Core can see (`proven`).
  const { done, todo, proven, checked } = checklistRead(input.checklist(seed), new Set(seed.filter((step) => step.replayed?.status === "replayed").map((step) => step.position)), checkedOnly(seed));
  const notRun = automationStudioFlowBootstrapStepsNotRunInThisBuild(seed);
  return {
    kind: "judged",
    seed,
    judgement: {
      round: input.round,
      stopped: input.stopped,
      tested,
      testIssueCodes,
      failedSteps: failedPositions(seed),
      stepsInFlow: seed.length,
      done,
      ...(tested === "not_tested" ? {} : { proven, checked }),
      todo,
      lastIssueCodes: [...new Set(input.lastIssueCodes)],
      ...(notRun.length ? { notRunInThisBuild: notRun } : {}),
      ...withFixSteps(tested === "replay_failed" ? failedPositions(seed) : []),
      flowSignature: automationStudioFlowDraftReplaySignature(seed)
    }
  };
}

/**
 * The judgement of a finished round not judged to do what was asked: a `no`,
 * an unsure verdict, or one not judged (a yes about another version of the
 * Flow or about no test arrives here as `not_judged`). Nothing is run here: the
 * loop's own test of this Flow already ran (`replayed_clean`), or ran none of
 * its carried steps, or the verdict was about another Flow's test or none
 * (`not_tested`). The seed is the Flow the round finished with, which the
 * repair starts from.
 */
export function automationStudioFlowBootstrapJudgeFinished(input: {
  round: number;
  steps: readonly AutomationStudioFlowDraftStep[];
  verdict: Exclude<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }>;
  checklist(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioInstructedActChecklistItem[] | undefined;
}): { judgement: AutomationStudioFlowBootstrapJudgement; seed: AutomationStudioFlowDraftStep[] } {
  const seed = automationStudioFlowBootstrapRepairSeed(input.steps);
  // A repair seed carries no replays: what worked in the loop's own test is read off the round's steps, by id.
  const workedIds = new Set(input.steps.filter((step) => step.replayed?.status === "replayed" && step.id !== undefined).map((step) => step.id));
  const checkedIds = new Set(input.steps.filter((step) => step.id !== undefined && checkedOnly([step]).size > 0).map((step) => step.id));
  const { done, todo, proven, checked } = checklistRead(input.checklist(seed), new Set(seed.filter((step) => step.id !== undefined && workedIds.has(step.id)).map((step) => step.position)), new Set(seed.filter((step) => step.id !== undefined && checkedIds.has(step.id)).map((step) => step.position)));
  const judge = judgedWrong(input.verdict);
  // A verdict that judged nothing, or another Flow's test, is no evidence this Flow ran: a `no` is always about the loop's own test.
  const testedThisFlow = input.verdict.verdict === "no" || input.verdict.flowSignature === automationStudioFlowDraftFlowSignature(input.steps);
  const notRun = automationStudioFlowBootstrapStepsNotRunInThisBuild(seed);
  const tested: AutomationStudioFlowBootstrapTested = judge.untestedCarried?.length || notRun.length || !testedThisFlow ? "not_tested" : "replayed_clean";
  return {
    seed,
    judgement: {
      round: input.round,
      stopped: "judged_wrong",
      tested,
      testIssueCodes: [],
      failedSteps: [],
      stepsInFlow: seed.length,
      done,
      ...(tested === "not_tested" ? {} : { proven, checked }),
      todo,
      lastIssueCodes: [],
      ...(notRun.length ? { notRunInThisBuild: notRun } : {}),
      judge,
      // A `no` is always about the loop's own test, which left the page where its last step did.
      ...withFixSteps(judge.verdict === "no" ? seed.filter((step) => step.effect === "observe").map((step) => step.position) : []),
      flowSignature: automationStudioFlowDraftReplaySignature(seed)
    }
  };
}

/**
 * A yes that was not about a test of the Flow as it now stands -- about
 * another version, or about no test -- as what it is for this Flow: not
 * judged, with Core's words for why. The signature it was about is kept.
 */
export function automationStudioFlowBootstrapYesNotAboutThisFlow(verdict: Extract<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }>): Extract<AutomationStudioFlowBootstrapTestVerdict, { verdict: "unknown" | "not_judged" }> {
  const why = verdict.flowSignature === undefined
    ? "the judge's yes was about no test of the Flow, so the Flow as it now stands was not judged"
    : "the judge's yes was about a test of another version of the Flow, not of the Flow as it now stands, so the Flow as it stands was not judged";
  return { verdict: "not_judged", why, spent: verdict.spent, ...(verdict.flowSignature !== undefined ? { flowSignature: verdict.flowSignature } : {}) };
}

/**
 * A tested judgement with the judge's account of that test added: what a round
 * the judging reserve stopped, or one that stopped short of a completion, is
 * left with when its Flow was judged and not found to do what was asked
 * (`./reserve-judging.ts`). Everything else -- what stopped it, what the test
 * found -- stays the test's.
 */
export function automationStudioFlowBootstrapWithJudgeAccount(judgement: AutomationStudioFlowBootstrapJudgement, verdict: Exclude<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }>): AutomationStudioFlowBootstrapJudgement {
  return { ...judgement, judge: judgedWrong(verdict) };
}

/** The judge's account, as a judgement keeps it: only what it said. */
function judgedWrong(verdict: Exclude<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }>): AutomationStudioFlowBootstrapJudgedWrong {
  if (verdict.verdict !== "no") {
    const reading = verdict.verdict === "unknown" ? readingOf(verdict.unconfirmedReading) : undefined;
    return {
      verdict: verdict.verdict,
      findings: verdict.why ? [verdict.why] : [],
      ...(verdict.untestedCarried?.length ? { untestedCarried: [...verdict.untestedCarried] } : {}),
      ...(reading ? { unconfirmedReading: reading } : {}),
      // Which pair it was -- one call said yes -- never its words: what a repair after a `no` is measured by (`./progress.ts`).
      ...(verdict.verdict === "unknown" && verdict.oneCallSaidYes === true ? { oneCallSaidYes: true as const } : {})
    };
  }
  return {
    verdict: "no",
    ...(verdict.expected ? { expected: verdict.expected } : {}),
    ...(verdict.observed ? { observed: verdict.observed } : {}),
    ...(verdict.advice ? { advice: verdict.advice } : {}),
    findings: [...verdict.findings],
    // Core's lines naming the rows, so the repair sees the rows and not only the finding code (t274-c25b).
    ...(verdict.fix?.length ? { fix: [...verdict.fix] } : {}),
    ...(verdict.checked?.length ? { checked: [...verdict.checked] } : {}),
    ...(verdict.records ? { records: { ...verdict.records } } : {}),
    // Whether what was asked can still be had: only a `no` here ends the build "not doable" (t195-w37, `./phases.ts`).
    ...(verdict.stillAchievable ? { stillAchievable: verdict.stillAchievable } : {})
  };
}

/** A copy of a judge's reading, keeping only what it said; nothing when it said nothing. */
function readingOf(reading: AutomationStudioFlowBootstrapJudgeReading | undefined): AutomationStudioFlowBootstrapJudgeReading | undefined {
  if (!reading) return undefined;
  const said: AutomationStudioFlowBootstrapJudgeReading = {
    ...(reading.expected ? { expected: reading.expected } : {}),
    ...(reading.observed ? { observed: reading.observed } : {}),
    ...(reading.advice ? { advice: reading.advice } : {})
  };
  return Object.keys(said).length ? said : undefined;
}

/** Acts and choices done, and the ids of those still to do, by the checklist's rule; of the proven, those whose step was only checked. */
function checklistRead(checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined, worked: ReadonlySet<number>, checkedPositions: ReadonlySet<number>): { done: number; todo: string[]; proven: number; checked: number } {
  const todo = automationStudioInstructedActsNotDone(checklist);
  const all = (checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  const provenAt = (checklist ?? []).flatMap((item) => [item.done, ...(item.choices ?? []).map((choice) => choice.done)]).filter((position): position is number => position !== undefined && worked.has(position));
  return { done: all - todo.length, todo, proven: provenAt.length, checked: provenAt.filter((position) => checkedPositions.has(position)).length };
}

/** The words of a step the test checked and did not run: it could run (`verified`), or it was already done on the site (`present`). */
const CHECKED_WORDS: ReadonlySet<string> = new Set(["verified", "present"]);

/** Positions of the steps the test checked and did not run (W24, run-mux74k5q-1c3c2127). */
function checkedOnly(steps: readonly AutomationStudioFlowDraftStep[]): ReadonlySet<number> {
  return new Set(steps.filter((step) => step.replayed?.status === "replayed" && CHECKED_WORDS.has(automationStudioFlowDraftReplayOutcomeWord(step.replayed))).map((step) => step.position));
}

/** The judgement as the repair's first decision reads it (`../../llm/evidence-loop/resume.ts`): codes, counts and ids, every one of them. */
export function automationStudioFlowBootstrapJudgementValue(judgement: AutomationStudioFlowBootstrapJudgement): JsonObject {
  return {
    stopped: judgement.stopped,
    test: judgement.tested,
    ...(judgement.failedSteps.length ? { stepsThatDidNotWork: [...judgement.failedSteps] } : {}),
    ...(judgement.testIssueCodes.length ? { testIssueCodes: [...judgement.testIssueCodes] } : {}),
    stepsInFlow: judgement.stepsInFlow,
    actsDone: judgement.done,
    actsTodo: [...judgement.todo],
    ...(judgement.lastIssueCodes.length ? { lastRefusedFor: [...judgement.lastIssueCodes] } : {}),
    ...(judgement.notRunInThisBuild?.length ? { notRunInThisBuild: [...judgement.notRunInThisBuild] } : {}),
    ...(judgement.judge ? { judge: judgeValue(judgement.judge) } : {}),
    ...(judgement.fixSteps?.length ? { whereToFix: judgement.fixSteps.map(whereStepStarts) } : {})
  };
}

/** The positions of the steps the test ran that did not work. */
function failedPositions(seed: readonly AutomationStudioFlowDraftStep[]): number[] {
  return seed.filter((step) => step.replayed !== undefined && step.replayed.status !== "replayed").map((step) => step.position);
}

/** `fixSteps` when there are any; nothing otherwise. */
function withFixSteps(positions: readonly number[]): { fixSteps?: number[] } {
  return positions.length ? { fixSteps: [...positions] } : {};
}

/**
 * Core's words for where one step to fix starts, in the Flow's own step
 * numbers and nothing of the page.
 *
 * **Why (run `run-muwansvz-a2b4a987`, R2-4).** A repair opens on the page the
 * test left, and is told to look first. The test of a Flow whose step 5 read
 * every results page left it on page 5, the last; the repair looked and
 * detected there, and the handle it minted had no pagination, because the last
 * page draws Next disabled. Every paging rerun on it was refused until the
 * purse ran out, though a rerun of step 5 runs from where step 5 starts. So
 * the repair is told, for each step it is to fix, which page that is -- the
 * one the step before it leaves -- and to look and detect there. Getting there
 * is the model's, the shortest way, as the resume's own instruction already
 * says for a page that is not where the draft leaves off
 * (`../../llm/evidence-loop/resume.ts`).
 */
function whereStepStarts(position: number): string {
  const start = position <= 1 ? "starts where the Flow starts" : `starts on the page step ${position - 1} leaves`;
  return `Step ${position} ${start}, which need not be the page the test left: a look or a detect made anywhere else describes that page, not the one step ${position} runs on. `
    + `Before you change step ${position}, get to where it starts the shortest way (mark any step you take only to get there exploratory), then look and detect there.`;
}

/**
 * The judge's account as the repair reads it: its words are the model's own,
 * already screened by the judge -- a `no`'s, and an `unknown`'s one
 * unconfirmed reading.
 */
function judgeValue(judge: AutomationStudioFlowBootstrapJudgedWrong): JsonObject {
  return {
    verdict: judge.verdict,
    ...(judge.expected ? { expected: judge.expected } : {}),
    ...(judge.observed ? { observed: judge.observed } : {}),
    ...(judge.advice ? { advice: judge.advice } : {}),
    findings: [...judge.findings],
    // Core's own lines on the rows, under their own keys so they are never read as the judge's (`resume.ts` says what they are).
    ...(judge.fix?.length ? { fix: [...judge.fix] } : {}),
    ...(judge.checked?.length ? { checked: [...judge.checked] } : {}),
    ...(judge.untestedCarried?.length ? { untestedCarried: [...judge.untestedCarried] } : {}),
    // An unknown's one unconfirmed reading, under its own key so it is never read as a no (`resume.ts` says what it is).
    ...(judge.unconfirmedReading ? { unconfirmedReading: { ...judge.unconfirmedReading } } : {})
  };
}
