// What a build that could not finish tells the person, beside its code.
//
// **Why a diagnostic that carries only codes carries a sentence here (t208).**
// Everything else on a failure is a code, because a code is what a reader
// counts and a sentence is what leaks. But the two endings of a build that
// could not finish are addressed to the person who asked for the Flow, and the
// user's rule for them is explicit: "not doable" is said with its reason --
// which acts cannot be done, why, and what was tried -- as a message they can
// read in the chat, not a code; and a budget that ran out is reported as
// exactly that, never dressed up as "not doable". A code the chat has to
// translate is the bare verdict the person was left with in 30 live runs that
// ended "Build failed" and nothing after (audit A3, cause 1).
//
// **Not finished is not "not doable" (t195-w37).** A build that stopped with
// a route still open -- a repair that got no further, twice in a row after a
// judge who named the fix, or a round that handed back the Flow it started
// from -- ends `not_finished`: the Flow so far kept, the honest reason, and
// what the judge said is left to change. Live run `run-murwcaj0-40e56557`
// ended "I found no way to" while its judge said the result was still
// achievable and named the fix. "Not doable" is now only a judge's word that
// what was asked can no longer be had (`noRoute: judged_unachievable`).
//
// So the message is written once, by Core, from Core's own words and the
// person's own words for what they asked (the act quotes the instruction
// reader took from their instruction), and never from anything a tool read off
// the target. The record beside it keeps the same facts as ids and counts for
// a reader that counts. Producer and reader share `parse…BuildEnding`, as every
// other field of this diagnostic does (`./failure-state.ts` says why).
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS } from "../../loop-limits/index.ts";
import type { AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";

/** Which budget ran out. */
export type AutomationStudioFlowBootstrapBudgetBound =
  /** The build's spend ceiling (the run cost ceiling, $0.10 by default, or the Flow's lower setting). */
  | "cost"
  /** The run's token budget. */
  | "tokens"
  /** The build's deadline. */
  | "duration"
  /** The call count the Flow's settings or the resolver declared. */
  | "calls"
  /** The repairs a build may make, reached while each was still getting further. */
  | "repair_rounds"
  /** The live rounds a build may run in all, the far backstop under the others. */
  | "rounds";

/** What a build that could not finish says about itself. */
export type AutomationStudioFlowBootstrapBuildEnding = {
  /**
   * `not_doable`: no route to what was asked is left -- the judge said it can
   * no longer be had. `not_finished`: a route is still open, but the build
   * stopped on rounds that measurably got no further (t195-w37), with the
   * Flow so far kept. `budget_exhausted`: a budget ran out first.
   * `replies_unreadable`: the model's replies kept arriving unreadable, each
   * asked again, until an unbroken run of them stopped the build (t211).
   * `provider_unavailable`: the model provider stopped answering -- an
   * unbroken run of requests got no answer -- and the build ended at once
   * (`../unfinished-build/provider-unavailable.ts`).
   */
  kind: "not_doable" | "not_finished" | "budget_exhausted" | "replies_unreadable" | "provider_unavailable";
  /** What the person reads in the chat: Core's sentences and their own words for what they asked. */
  message: string;
  /** `budget_exhausted` only: which budget. */
  bound?: AutomationStudioFlowBootstrapBudgetBound;
  /** Each act or choice not done, by id, in the person's words, and why, as the checklist's code. */
  notDone: Array<{ id: string; quote: string; todo: string }>;
  /**
   * What was tried: live rounds (exploration, then each repair), decisions in
   * all, the Flow's steps, and what the last test found. `stops` is why each
   * round stopped, in order (`../unfinished-build/phases.ts`): what a debug
   * reads to tell which bound ended which round (live run muqk713g). `noRoute`
   * is which case ended the build: on `not_doable` the case that left no route
   * (`judged_unachievable`; `no_progress` and `repeated_unchanged` on records
   * written before t195-w37), on `not_finished` what stood still
   * (`no_progress`, `repeated_unchanged`). Closed words only, so
   * the run record and the Lab publish them as they are; absent on a record
   * written before they were kept.
   */
  tried: {
    rounds: number;
    decisions: number;
    stepsInFlow: number;
    tested: "replayed_clean" | "replay_failed" | "not_tested";
    stops?: Array<{ round: number; stopped: AutomationStudioFlowBootstrapRoundStopped }>;
    noRoute?: { kind: AutomationStudioFlowBootstrapEndingRoute };
  };
};

/** Which case ended a build, on `not_doable` and `not_finished` (`tried.noRoute`). */
export type AutomationStudioFlowBootstrapEndingRoute = "no_progress" | "repeated_unchanged" | "judged_unachievable";

/**
 * Why one live round stopped: the round's own stop
 * (`../unfinished-build/contracts.ts`, `AutomationStudioFlowBootstrapUnfinishedStop`),
 * or `budget` where a budget stopped it.
 */
export type AutomationStudioFlowBootstrapRoundStopped = "iterations" | "tool_calls" | "unusable_decisions" | "repeat_without_progress" | "judged_wrong" | "budget";

/** The code each ending is published under. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_CODES: Readonly<Record<AutomationStudioFlowBootstrapBuildEnding["kind"], AutomationStudioFlowBootstrapFailureDiagnostic["code"]>> = Object.freeze({
  not_doable: "flow_bootstrap.not_doable",
  not_finished: "flow_bootstrap.build_not_finished",
  budget_exhausted: "flow_bootstrap.evidence_budget_exhausted",
  replies_unreadable: "flow_bootstrap.model_replies_unreadable",
  provider_unavailable: "flow_bootstrap.provider_unavailable"
});

/** The most a message may hold: what the chat shows of one row (`ClientGatewayActivity`, `detail.text`). */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE = 1_000;

const MAX_NOT_DONE = 16;
const MAX_QUOTE = 200;
const MAX_COUNT = 10_000;
const BOUNDS: readonly string[] = ["cost", "tokens", "duration", "calls", "repair_rounds", "rounds"];
const TESTED: readonly string[] = ["replayed_clean", "replay_failed", "not_tested"];
const STOPPED: readonly string[] = ["iterations", "tool_calls", "unusable_decisions", "repeat_without_progress", "judged_wrong", "budget"] satisfies readonly AutomationStudioFlowBootstrapRoundStopped[];
/** The cases each ending may record as `tried.noRoute`. */
const NO_ROUTE: Readonly<Partial<Record<AutomationStudioFlowBootstrapBuildEnding["kind"], readonly AutomationStudioFlowBootstrapEndingRoute[]>>> = Object.freeze({
  not_doable: ["judged_unachievable", "no_progress", "repeated_unchanged"],
  not_finished: ["no_progress", "repeated_unchanged"]
});
const ACT_ID = /^a[1-9][0-9]{0,2}(?:\.[a-z]{1,16})?$/u;
const CODE = /^[a-z0-9_.:-]{1,100}$/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;

/**
 * The ending, or `null` for one that is not well formed, or `undefined` when
 * there is none -- which is right exactly when `code` is neither ending's.
 */
export function parseAutomationStudioFlowBootstrapBuildEnding(value: unknown, code: string): AutomationStudioFlowBootstrapBuildEnding | null | undefined {
  const expected = Object.entries(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_CODES).find(([, endingCode]) => endingCode === code)?.[0];
  if (value === undefined) return expected ? null : undefined;
  if (!expected || !isRecord(value) || !exact(value, ["kind", "message", "bound", "notDone", "tried"]) || value.kind !== expected) return null;
  if (typeof value.message !== "string" || !value.message.trim() || value.message.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE || CONTROL.test(value.message)) return null;
  if (value.kind === "budget_exhausted" ? typeof value.bound !== "string" || !BOUNDS.includes(value.bound) : value.bound !== undefined) return null;
  if (!Array.isArray(value.notDone) || value.notDone.length > MAX_NOT_DONE) return null;
  const notDone: AutomationStudioFlowBootstrapBuildEnding["notDone"] = [];
  for (const item of value.notDone) {
    if (!isRecord(item) || !exact(item, ["id", "quote", "todo"]) || typeof item.id !== "string" || !ACT_ID.test(item.id)) return null;
    if (typeof item.quote !== "string" || item.quote.length > MAX_QUOTE || CONTROL.test(item.quote)) return null;
    if (typeof item.todo !== "string" || !CODE.test(item.todo)) return null;
    notDone.push({ id: item.id, quote: item.quote, todo: item.todo });
  }
  const tried = value.tried;
  if (!isRecord(tried) || !exact(tried, ["rounds", "decisions", "stepsInFlow", "tested", "stops", "noRoute"])) return null;
  if (!count(tried.rounds) || !count(tried.decisions) || !count(tried.stepsInFlow) || typeof tried.tested !== "string" || !TESTED.includes(tried.tested)) return null;
  const stops = parseStops(tried.stops);
  if (stops === null) return null;
  const noRoute = tried.noRoute;
  const routes: readonly string[] = NO_ROUTE[value.kind as AutomationStudioFlowBootstrapBuildEnding["kind"]] ?? [];
  if (noRoute !== undefined && (!isRecord(noRoute) || !exact(noRoute, ["kind"]) || typeof noRoute.kind !== "string" || !routes.includes(noRoute.kind))) return null;
  return {
    kind: value.kind as AutomationStudioFlowBootstrapBuildEnding["kind"],
    message: value.message,
    ...(value.kind === "budget_exhausted" ? { bound: value.bound as AutomationStudioFlowBootstrapBudgetBound } : {}),
    notDone,
    tried: {
      rounds: tried.rounds as number,
      decisions: tried.decisions as number,
      stepsInFlow: tried.stepsInFlow as number,
      tested: tried.tested as AutomationStudioFlowBootstrapBuildEnding["tried"]["tested"],
      ...(stops ? { stops } : {}),
      ...(isRecord(noRoute) ? { noRoute: { kind: noRoute.kind as AutomationStudioFlowBootstrapEndingRoute } } : {})
    }
  };
}

/** Each round's stop, at most one per live round a build may run; `null` for a list that is not well formed, `undefined` for none. */
function parseStops(value: unknown): NonNullable<AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"]> | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS) return null;
  const stops: NonNullable<AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"]> = [];
  for (const item of value) {
    if (!isRecord(item) || !exact(item, ["round", "stopped"]) || !count(item.round) || typeof item.stopped !== "string" || !STOPPED.includes(item.stopped)) return null;
    stops.push({ round: item.round as number, stopped: item.stopped as AutomationStudioFlowBootstrapRoundStopped });
  }
  return stops;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function count(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_COUNT;
}
