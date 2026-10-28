import type { AutomationStudioProjectTaskSpec } from "../contracts/index.ts";

/**
 * How one part of a task spec compares across two plans (`./subflow-change.ts`):
 * the same; only its words moved by a word or two at their ends (`reworded`,
 * t595); its facts changed (`facts`); its lasting acts changed, its facts
 * perhaps with them (`acts`, t671); or otherwise changed (`changed`): it is new
 * or gone, quotes another instruction, or its words changed beyond a
 * rewording. `what` says what changed in words for every change but `same`
 * and `reworded`. A part that is the same, reworded, or changed only in its
 * facts or lasting acts keeps its id and quotes the same words, so a proposal
 * built for it can be carried and judged again (t671).
 */
export type AutomationStudioProjectSupervisorPartChange = { change: "same" | "reworded" | "facts" | "acts" | "changed"; what?: string };

/** The most words a part's text may gain or lose at its two ends together and still be the same part reworded (t595). */
const EDGE_WORDS = 2;

/**
 * Whether part `id` is the same in both specs (above). Its source is compared
 * as it is, its words with `EDGE_WORDS` of give at their ends, case and
 * punctuation set aside, its lasting acts as a set, and its facts trimmed,
 * case and whitespace set aside.
 */
export function automationStudioProjectSupervisorPartChange(now: AutomationStudioProjectTaskSpec, then: AutomationStudioProjectTaskSpec, id: string): AutomationStudioProjectSupervisorPartChange {
  const ours = now.parts.find((part) => part.id === id);
  const theirs = then.parts.find((part) => part.id === id);
  if (!ours || !theirs) return { change: "changed", what: ours ? "it is a new part" : "it is no longer in the task spec" };
  if (ours.quote.sourceId !== theirs.quote.sourceId) return { change: "changed", what: "it quotes another instruction" };
  const text = ours.quote.text === theirs.quote.text ? "same" : withinEdges(wordsOf(ours.quote.text), wordsOf(theirs.quote.text)) ? "reworded" : "changed";
  if (text === "changed") return { change: "changed", what: "its words changed by more than a word or two at their ends" };
  // The answer a part declares it owes is what the judge holds a run to, so a proposal built for another one is not carried (t764).
  if (!same(ours.answer ?? null, theirs.answer ?? null)) return { change: "changed", what: "its declared answer changed" };
  const facts = !same(ours.goalFacts.map(fact), theirs.goalFacts.map(fact));
  const actsNow = [...ours.lastingActs].sort();
  const actsThen = [...theirs.lastingActs].sort();
  if (!same(actsNow, actsThen)) return { change: "acts", what: `its lasting acts changed, from ${listed(actsThen)} to ${listed(actsNow)}${facts ? ", and its facts changed" : ""}` };
  if (facts) return { change: "facts", what: "its facts changed" };
  return { change: text };
}

/** Lasting acts as said in an answer: each by its name, or none. */
function listed(acts: readonly string[]): string {
  return acts.length ? acts.join(", ") : "none";
}

/** A goal fact as compared across plans: trimmed, lower case, each run of whitespace one space. */
function fact(text: string): string {
  return text.trim().replace(/\s+/gu, " ").toLowerCase();
}

/** A text's words, lower case, with no punctuation. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Whether the shorter word list is the longer one with at most `EDGE_WORDS` words taken off its two ends together. */
function withinEdges(left: readonly string[], right: readonly string[]): boolean {
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (!short.length || long.length - short.length > EDGE_WORDS) return false;
  for (let start = 0; start <= long.length - short.length; start += 1) {
    if (short.every((word, index) => long[start + index] === word)) return true;
  }
  return false;
}

/** Whether two plain values hold the same JSON. */
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
