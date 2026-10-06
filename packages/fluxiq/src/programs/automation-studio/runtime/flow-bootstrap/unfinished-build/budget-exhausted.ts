// A budget ran out before the Flow was finished: reported as exactly that.
//
// The user's rule (2026-09-30): a budget or cost ceiling that is hit is said
// as the budget it is, never dressed up as "not doable" -- a build that ran
// out of money had a route it did not get to finish. So the message names the
// budget, what of the request the Flow already does, what was tried and what
// blocked it, and whether the steps found so far were kept for the next build
// to carry on from. It is also how a build that authored nothing ends
// (supervisor, t208): never as a bare code, always with this message. What
// was kept is said as a draft (`./kept-said.ts`; t195-w37, live run
// `run-murz83zy-5030820f`, whose chat also said the Flow was left empty).
// What was tried is said as every ending says it, with no count of decisions
// or rounds (`automationStudioFlowBootstrapWorkedLiveSaid`, t195-w48); the
// counts stay in `tried`. The message is fitted, never cut inside a sentence
// (`./ending-fit.ts`; t193 round 1003): what was tried and what was kept close
// it, always whole.
//
// **Plain words, one money sentence (R2-U-2).** Live run
// `run-muwansvz-a2b4a987` ended "its next call could have cost up to $0.008,
// more than was left beside the $0.014 kept back for judging the Flow, and
// that was not spent, because the Flow was unchanged since the judge said ...,
// and it had spent $0.079 ($0.000 of it by earlier builds of this Flow) in
// all", and never said what blocked the fix. The purse's arithmetic -- the
// refused call's worst case, the judging reserve, earlier builds' share, what
// another round needed -- is the purse's record (`../../llm/build-purse/`),
// not the person's. A cost ending now says that the build used its budget for
// this Flow, then one sentence of money: "Building this Flow has used $0.08 of
// its spending limit of $0.10, and what was left was too little to go on."
// What blocked the last fix is read from the round's own record
// (`./last-fix.ts`): each try turned down as unchanged, a step that named
// nothing on the page or did not say which list to read, a step that did not
// work. The check's account of the Flow, where it was judged, is said as
// "Its last check found", in a person's words
// (`automationStudioActivityPersonWords`): never "the judge", "Step 8" or
// "dedup".
import { automationStudioActivityPersonWords } from "../../activity/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "../../llm/index.ts";
import {
  type AutomationStudioFlowBootstrapBudgetBound,
  type AutomationStudioFlowBootstrapBuildEnding
} from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "./contracts.ts";
import {
  automationStudioFlowBootstrapBlockedSaid,
  automationStudioFlowBootstrapNotDone,
  automationStudioFlowBootstrapProgressAndTestSaid,
  automationStudioFlowBootstrapStopSaid,
  automationStudioFlowBootstrapUnsettledForBuild,
  automationStudioFlowBootstrapWorkedLiveSaid
} from "./not-done.ts";
import { automationStudioFlowBootstrapEndingFitted } from "./ending-fit.ts";
import { automationStudioFlowBootstrapJudgeWordsSaid } from "./judge-words.ts";
import { automationStudioFlowBootstrapKeptSaid } from "./kept-said.ts";
import { automationStudioFlowBootstrapLastFixBlockedSaid } from "./last-fix.ts";
import { automationStudioFlowBootstrapTried } from "./tried.ts";

/** The size of each budget, as the person is told it. */
export type AutomationStudioFlowBootstrapBudgetSizes = {
  maxCostUsd?: number | undefined;
  maxDurationMs?: number | undefined;
  maxTotalTokens?: number | undefined;
  declaredCalls?: number | undefined;
  maxRounds?: number | undefined;
};

/**
 * What one more round needs at least under the purse (t240, t254;
 * `./round-funding.ts`): where `judged`, the judging of its Flow -- two judge
 * calls, each at its capped hold (`judgingUsd`) -- and the least its first
 * decision can be held at, its reply reserve alone (`decisionUsd`). `usd` is
 * their sum. The first decision itself is priced from its own request when it
 * is sent. A round is not opened that the purse cannot fund for this.
 */
export type AutomationStudioFlowBootstrapNextRoundHold = { usd: number; judged: boolean; judgingUsd?: number | undefined; decisionUsd?: number | undefined };

/**
 * What a cost ending knows was spent: what the whole build had spent when its
 * cost budget stopped it, what was held for calls still in flight, and the
 * worst case of the call the purse refused (`../../llm/build-purse/`) -- absent
 * where the provider does not price or no call was refused. The person is told
 * only what was used of the ceiling (R2-U-2); the rest is the purse's record.
 */
export type AutomationStudioFlowBootstrapCostSpending = {
  spentUsd: number;
  pendingUsd: number;
  projectedCostUsd?: number | undefined;
  /** What earlier builds of the same Flow creation spent, included in `spentUsd`. Absent when none. */
  carriedUsd?: number | undefined;
  /** What the purse kept back for judging the Flow, which the refused call had to leave (t254). Absent when nothing was. */
  keptBackUsd?: number | undefined;
  /**
   * The Flow creation's ceiling, where one purse holds every build of it
   * (t234): what was used is said of it, and of the whole creation. Absent
   * where the build was given no purse.
   */
  ceilingUsd?: number | undefined;
  /**
   * What the round the purse could not fund would have needed at worst, where
   * nothing was refused and the purse was not spent outright. Absent otherwise.
   */
  nextRound?: AutomationStudioFlowBootstrapNextRoundHold | undefined;
  /**
   * What testing and judging the Flow as it stood cost, where the refused call
   * would have eaten into the judging kept back and that reserve was spent
   * judging the Flow instead (t254 stage 2, `./reserve-judging.ts`): the
   * check's account is said. Absent otherwise.
   */
  judgedUsd?: number | undefined;
  /**
   * The refused call would have eaten into the judging kept back, and that
   * reserve was not spent: the Flow was unchanged since a judge of this build
   * said it does not do what was asked (t254 stage 3, `./phases.ts`), whose
   * account is said. Absent otherwise.
   */
  unchangedSinceJudgedNo?: true | undefined;
};

/** The budget ending. */
export function automationStudioFlowBootstrapBudgetExhausted(input: {
  bound: AutomationStudioFlowBootstrapBudgetBound;
  sizes: AutomationStudioFlowBootstrapBudgetSizes;
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  rounds: number;
  decisions: number;
  /** Why each live round stopped, in order (`./tried.ts`). */
  stops?: AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"] | undefined;
  /** Whether the steps found so far were kept for the next build. */
  kept: boolean;
  /**
   * What the cost budget stopped it at, said only for a `cost` ending: what
   * was used of the ceiling.
   */
  spending?: AutomationStudioFlowBootstrapCostSpending | undefined;
  /**
   * The last round's record, which what blocked the last fix is read from
   * (`./last-fix.ts`). Absent, the last refusal codes say it, where known.
   */
  lastRound?: readonly AutomationStudioLlmEvidenceLoopTrace[] | undefined;
}): AutomationStudioFlowBootstrapBuildEnding {
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const kept = automationStudioFlowBootstrapKeptSaid(input.kept);
  // A Flow the judge did not pass is already said so with how far it got (`./not-done.ts`), so its stop is not said
  // again as what held it up: "... not judged to do what you asked ... what held it up was that the Flow it thought
  // was ready was not judged to do what you asked" (t264 S3, one owner of the ending's words).
  const saidJudged = input.judgement.stopped === "judged_wrong" && input.judgement.judge !== undefined;
  const lastFix = automationStudioFlowBootstrapLastFixBlockedSaid(input.lastRound ?? [], input.rounds > 1);
  const blocked = lastFix ? "" : automationStudioFlowBootstrapBlockedSaid(input.judgement.lastIssueCodes)
    || (input.judgement.stopped === "budget" || saidJudged ? "" : automationStudioFlowBootstrapStopSaid(input.judgement.stopped));
  const tried = `${automationStudioFlowBootstrapWorkedLiveSaid(input.rounds)}.${lastFix ? ` ${lastFix}` : blocked ? ` What held it up was that ${blocked}.` : ""}`;
  const spent = input.bound === "cost" && input.spending ? spentSaid(input.spending, input.sizes.maxCostUsd) : "";
  const judged = input.bound === "cost" && (input.spending?.judgedUsd !== undefined || input.spending?.unchangedSinceJudgedNo);
  const message = automationStudioFlowBootstrapEndingFitted((room) => ({
    body: [
      spent ? `The build used its budget for this Flow before the Flow was finished. ${spent}` : `The build stopped at ${budgetSaid(input.bound, input.sizes)} before the Flow was finished.`,
      // How far it got and what its test found, said once: never "not judged" twice (`./not-done.ts`).
      automationStudioFlowBootstrapProgressAndTestSaid(input.checklist, input.judgement, room),
      judged ? checkFoundSaid(input.judgement.judge, room.judge) : ""
    ],
    close: [tried, kept]
  }));
  return {
    kind: "budget_exhausted",
    message,
    bound: input.bound,
    notDone,
    tried: automationStudioFlowBootstrapTried(input)
  };
}

function budgetSaid(bound: AutomationStudioFlowBootstrapBudgetBound, sizes: AutomationStudioFlowBootstrapBudgetSizes): string {
  switch (bound) {
    case "cost": return sizes.maxCostUsd !== undefined ? `its spending limit of $${sizes.maxCostUsd.toFixed(2)}` : "its spending limit";
    case "duration": return sizes.maxDurationMs !== undefined ? `its time limit of ${Math.round(sizes.maxDurationMs / 60_000)} minutes` : "its time limit";
    case "tokens": return sizes.maxTotalTokens !== undefined ? `its budget of ${sizes.maxTotalTokens} tokens` : "its token budget";
    case "calls": return sizes.declaredCalls !== undefined ? `its limit of ${sizes.declaredCalls} model calls` : "its limit on model calls";
    // No build reaches it since t240 -- repairs are bounded by money and progress -- but published records may carry it.
    case "repair_rounds": return "its limit on repairs";
    case "rounds": return sizes.maxRounds !== undefined ? `its limit of ${sizes.maxRounds} live rounds` : "its limit on live rounds";
  }
}

/**
 * The one money sentence: what was used of the spending limit -- of the Flow's
 * whole creation where one purse holds it, earlier builds included -- and that
 * what was left was too little to go on, or that all of it was used.
 */
function spentSaid(spending: AutomationStudioFlowBootstrapCostSpending, maxCostUsd: number | undefined): string {
  const used = spending.spentUsd + spending.pendingUsd;
  const ceiling = spending.ceilingUsd ?? maxCostUsd;
  const who = spending.ceilingUsd !== undefined ? "Building this Flow has used" : "It used";
  if (ceiling === undefined) return `${who} ${money(used, undefined)}.`;
  const limit = `its spending limit of $${ceiling.toFixed(2)}`;
  return ceiling - used >= 0.0005
    ? `${who} ${money(used, ceiling)} of ${limit}, and what was left was too little to go on.`
    : `${who} all of ${limit}.`;
}

/** Dollars to the cent, or to a tenth of one where cents would read as the whole limit or as nothing. */
function money(amount: number, ceiling: number | undefined): string {
  const cents = amount.toFixed(2);
  return amount < 0.01 || (ceiling !== undefined && cents === ceiling.toFixed(2)) ? `$${amount.toFixed(3)}` : `$${cents}`;
}

/**
 * What the last check found of the Flow as it stood, where the judging reserve
 * was spent judging it, or where a check had said no to it unchanged: what it
 * observed or its first finding, and what it says is left to change; or why it
 * could not confirm the Flow. Empty when it said nothing. Its words are in a
 * person's words (`automationStudioActivityPersonWords`), screened plain and
 * said in whole sentences (`./judge-words.ts`, t276), never a quote cut short.
 */
function checkFoundSaid(judge: AutomationStudioFlowBootstrapJudgement["judge"], most: number): string {
  if (!judge) return "";
  const words = (text: string): string => automationStudioFlowBootstrapJudgeWordsSaid(automationStudioActivityPersonWords(text), most);
  const finding = words(automationStudioFlowBootstrapUnsettledForBuild(judge.observed ?? judge.findings[0] ?? ""));
  if (judge.verdict !== "no") return finding ? `Its last check could not confirm it: ${finding}` : "";
  const advice = words(judge.advice ?? "");
  return [finding ? `Its last check found: ${finding}` : "", advice ? `What is left to change: ${advice}` : ""].filter(Boolean).join(" ");
}
