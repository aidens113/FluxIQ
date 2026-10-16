// A no whose advice changes, removes or loosens only conditions Core names,
// weighed by those conditions rather than by its wording (t631).
//
// **Why.** A8 bigbox `run-mv9gbsm5-2957581c`: four trials stored exactly the
// rows asked for, and six of eight judge calls on them were wrong. Each wrong no
// asked to change a condition -- "remove conditions 4-6", "remove or relax
// condition 4", "replace condition 2" -- calling it "extra narrowing" that
// "could drop" a row, or saying it dropped rows "which the request does not
// exclude". Core's read account already said otherwise: conditions 4-6 each
// left out no row alone, and every row condition 2 alone left out showed a value
// Core read failing the request's own words. Refuting a no by the words that
// call rows missing (t607, t629) had missed a new wording in each of three waves
// running; what the advice names does not depend on its wording.
//
// **The rule.** The advice is read sentence by sentence, each without Core's own
// wording of the conditions it names (`./condition-wording.ts`). It qualifies
// when every sentence either keeps what it names ("Keep the filter at <step>")
// or changes, removes or loosens conditions Core names by number
// (`./condition-references.ts`) and nothing else: it names no row, no row Core
// has no record of, no step but the reads those conditions belong to
// (`./node-ids.ts`), no claim about pages or order the record leaves standing,
// and asks to add, tighten or restrict nothing. Each number must resolve to one
// condition of the record (`./record-conditions.ts`), within the reads the
// sentence names. Then the no is refuted -- asked once more, and unsure if it
// says the same (`./reask.ts`), never a no and never a yes Core made -- when,
// for each such condition, Core's account shows that removing or loosening it
// alone brings back no row the request could ask for: it left no row out by
// itself, or each row it alone left out is also a row of the result or failed
// the request's own words by the value Core read.
//
// **And the rows the named conditions left out together.** Removing several
// conditions of one read at once also brings back every row that only they
// rejected, together: a row two of them rejected and no other condition did.
// No read account names such a row or the conditions that rejected it -- it
// counts each condition's rejections (`rejected`) and names only the rows one
// left out by itself (`alone`, `leftOutOnlyByThis`) -- so Core cannot settle
// one. What the counts do measure is whether one can exist: such a row is
// rejected by at least two of the named conditions without being left out by
// either alone, so each of them rejected more rows than it alone left out.
// Where at most one named condition of a read did, no row is left out by that
// set together, and the advice is weighed as above. Where two or more did, or a
// named condition's count is missing, the account cannot say which conditions
// left those rows out, and the advice is not refuted by its conditions at all:
// the no falls through to the rows it names and the wording claims
// (`./weigh.ts`). Core refutes only what it measured (t631 follow-up).
//
// **Unless the read names those rows (t655).** A read that sends the rows its
// conditions left out together (`leftOutTogether`), and whose own counts say
// it sent every one (`./record.ts`, `together`), says which set of conditions
// left each out. Removing the named conditions brings one back only where
// every condition it failed is among them: where no set is, none comes back
// and the advice is weighed as above; where one is, Core has no account of
// that row, and the advice is not refuted by its conditions.
//
// A condition whose rows Core cannot all account for, or whose rows the read
// did not send, leaves the no standing too.

import { automationStudioResultWithoutConditionWording } from "./condition-wording.ts";
import { automationStudioResultConditionReferences } from "./condition-references.ts";
import { automationStudioResultSentenceRows } from "./named-rows.ts";
import { automationStudioResultNodeIdsSaid } from "./node-ids.ts";
import { automationStudioResultReadingSentences } from "./sentences.ts";
import type { AutomationStudioResultNoCondition, AutomationStudioResultNoRecord } from "./types.ts";
import { automationStudioResultNarrowingStepsNamed, automationStudioResultStepRemovedNoRow } from "./unseen-row-claim.ts";

/** Words that change, remove or loosen what they name. Generic, never any site's. */
const CHANGES = /\b(?:remov(?:e|es|ed|ing)|drop(?:s|ped|ping)?|delet(?:e|es|ed|ing)|relax(?:es|ed|ing)?|loosen(?:s|ed|ing)?|widen(?:s|ed|ing)?|broaden(?:s|ed|ing)?|replac(?:e|es|ed|ing)|chang(?:e|es|ed|ing)|rewrit(?:e|es|ing)|rewritten|fix(?:es|ed|ing)?|revis(?:e|es|ed|ing))\b/iu;
/** Words that add, tighten or restrict: advice that asks for more than a change of what it names. */
const NARROWS = /\b(?:add(?:s|ed|ing)?|tighten(?:s|ed|ing)?|narrow(?:s|ed|ing|er)?|restrict(?:s|ed|ing)?|require[sd]?|requiring|enforc(?:e|es|ed|ing)|ensur(?:e|es|ed|ing)|rais(?:e|es|ed|ing)|increas(?:e|es|ed|ing)|lower(?:s|ed|ing)?|decreas(?:e|es|ed|ing)|stricter|exclud(?:e|es|ed|ing)|leave\s+out|filter\s+out|dedup\w*|deduplicat\w*|sort(?:s|ed|ing)?|insert(?:s|ed|ing)?|only)\b/iu;
/** A sentence that keeps what it names. */
const KEEPS = /^\s*(?:keep|leave)\b/iu;
/** A condition's name as Core says it, capitalised to start a sentence. */
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The conditions a no's advice changes, every one of which Core's record clears, and Core's finding for each. */
export type AutomationStudioResultAdvisedConditions = { conditions: AutomationStudioResultNoCondition[]; nodeIds: string[]; findings: string[] };

/** The conditions a qualifying advice changes, where Core's record clears each (header); nothing otherwise. */
export function automationStudioResultAdviceConditions(advice: string | undefined, record: AutomationStudioResultNoRecord): AutomationStudioResultAdvisedConditions | undefined {
  const conditions = automationStudioResultAdviceChangedConditions(advice, record);
  if (!conditions || !conditions.every(cleared) || mayLeaveOutTogether(conditions, record)) return undefined;
  const reads = new Set((record.conditions ?? []).map((condition) => condition.nodeId));
  return { conditions, nodeIds: [...new Set(conditions.map((condition) => condition.nodeId))], findings: conditions.map((condition) => finding(condition, reads.size > 1)) };
}

/**
 * The conditions an advice changes, removes or loosens where it qualifies
 * (header: each sentence keeps what it names, or changes conditions Core names
 * by number and nothing else), whether or not Core's record clears them;
 * nothing where any sentence asks or names more. What a later trial's no is
 * held to across a build's trials (`../standing-no/`, t633).
 */
export function automationStudioResultAdviceChangedConditions(advice: string | undefined, record: AutomationStudioResultNoRecord): AutomationStudioResultNoCondition[] | undefined {
  const all = record.conditions ?? [];
  if (!all.length) return undefined;
  const chosen = new Map<string, AutomationStudioResultNoCondition>();
  for (const sentence of automationStudioResultReadingSentences(advice).map(automationStudioResultWithoutConditionWording)) {
    const numbers = automationStudioResultConditionReferences(sentence);
    const steps = automationStudioResultNodeIdsSaid(sentence, record.nodeIds).ids;
    if (!numbers.length) {
      // A sentence that keeps what it names changes nothing; any other may ask a change Core does not weigh here.
      if (KEEPS.test(sentence) && !CHANGES.test(sentence) && !NARROWS.test(sentence)) continue;
      return undefined;
    }
    if (KEEPS.test(sentence) || !CHANGES.test(sentence) || NARROWS.test(sentence)) return undefined;
    const named = automationStudioResultSentenceRows(sentence, record);
    if (named.stored.length || named.leftOut.length || named.unmatched) return undefined;
    const other = record.other?.(sentence);
    if (other && !other.refuted) return undefined;
    const here: AutomationStudioResultNoCondition[] = [];
    for (const number of numbers) {
      const candidates = all.filter((condition) => condition.number === number && (!steps.length || steps.includes(condition.nodeId)));
      if (candidates.length !== 1) return undefined;
      here.push(candidates[0]!);
    }
    // Every step it names is a read whose condition it changes.
    if (steps.some((step) => !here.some((condition) => condition.nodeId === step))) return undefined;
    for (const condition of here) chosen.set(`${condition.nodeId}\u0000${condition.name}`, condition);
  }
  const conditions = [...chosen.values()];
  return conditions.length ? conditions : undefined;
}

/** How a read's conditions are told apart from a saved answer's on the same node: its name's place. */
const SAVED_ANSWER = "recordOutput.process.where ";

/**
 * Whether a row may have been left out only by several named conditions of one
 * read together (header): where the read names every such row, whether one
 * failed only named conditions (t655); else whether two or more of them
 * rejected rows another condition rejected too, or one's count is missing.
 */
function mayLeaveOutTogether(conditions: readonly AutomationStudioResultNoCondition[], record: AutomationStudioResultNoRecord): boolean {
  const byRead = new Map<string, AutomationStudioResultNoCondition[]>();
  for (const condition of conditions) {
    const key = `${condition.nodeId}\u0000${condition.name.startsWith(SAVED_ANSWER)}`;
    byRead.set(key, [...(byRead.get(key) ?? []), condition]);
  }
  return [...byRead.values()].some((named) => {
    if (named.length < 2) return false;
    const listed = named[0]!.name.startsWith(SAVED_ANSWER) ? undefined : record.together?.find((read) => read.nodeId === named[0]!.nodeId);
    if (listed) {
      const numbers = new Set(named.map((condition) => condition.number));
      return listed.sets.some((set) => set.every((number) => numbers.has(number)));
    }
    return named.some((condition) => condition.rejected === undefined)
      || named.filter((condition) => condition.rejected! > (condition.leftOut?.length ?? 0)).length > 1;
  });
}

/** Whether Core accounts for every row a condition alone left out (header). */
function cleared(condition: AutomationStudioResultNoCondition): boolean {
  return condition.leftOut !== undefined && condition.leftOut.every((row) => row.accounted !== undefined);
}

/** Core's words for one cleared condition: what its read's account shows, and what removing or loosening it alone brings back. */
function finding(condition: AutomationStudioResultNoCondition, sayRead: boolean): string {
  const name = `${condition.name}${sayRead ? ` of read ${condition.nodeId}` : ""}`;
  const rows = condition.leftOut ?? [];
  if (!rows.length) {
    const rejected = condition.rejected ?? 0;
    const withAnother = rejected > 0 ? `: ${rejected === 1 ? "the one row" : `each of the ${rejected} rows`} it rejected, another condition rejected too` : "";
    return `${capital(name)} left out no row by itself${withAnother}. Removing or loosening it alone brings back no row.`;
  }
  const inResult = rows.filter((row) => row.accounted?.by === "also_in_result").length;
  const texts = [...new Set(rows.flatMap((row) => row.accounted?.by === "request_words" ? row.accounted.texts : []))];
  const failing = rows.length - inResult;
  const parts = [
    ...(failing ? [`${failing} show${failing === 1 ? "s" : ""} a value Core read that fails the request's own words ${texts.map((text) => `"${text}"`).join(" or ")}`] : []),
    ...(inResult ? [`${inResult} ${inResult === 1 ? "is" : "are"} also a row of the result, another copy kept`] : [])
  ];
  return `Of the ${rows.length} row${rows.length === 1 ? "" : "s"} ${name} left out by itself, ${parts.join(", and ")}. Removing or loosening it alone brings back no row the request asks for.`;
}

// A no whose advice only removes or replaces steps that acted on the page
// before a read, each one Core measured as removing no row (t659), weighed as
// the condition advice above weighs advice that changes conditions (t631).
//
// **Why.** A8 frozen pair 6 candidate towels `run-mvac1av6-f7b0f9e2`: both
// runtime nos advised "Remove or replace <the rating step>", a step after which
// the page stated as many results as before. The refuted run's advice became
// the re-author's brief, and the re-author spent 48 decisions removing a step
// that changed no row, then broke the read.
//
// **The rule.** The advice is read sentence by sentence, each without Core's
// own wording of the conditions it names. It qualifies when every sentence
// either keeps what it names ("Keep the search step") or removes, undoes,
// clears or replaces narrowing steps (`./unseen-row-claim.ts`) and
// nothing else: it names no row, no row Core has no record of, no condition by
// number, no step but those and the reads they came before, and asks for
// nothing more -- to add, choose, tighten, exclude, sort, or to replace "with"
// something else. Then, where Core measured of each named step that it removed
// no row (`./unseen-row-claim.ts`), the advice is a refuted claim of its
// own (`./weigh.ts`).

/** Words that remove, undo or replace what they name. Generic, never any site's. */
const UNDOES = /\b(?:remov(?:e|es|ed|ing)|drop(?:s|ped|ping)?|delet(?:e|es|ed|ing)|undo(?:es|ing)?|uncheck(?:s|ed|ing)?|deselect(?:s|ed|ing)?|unselect(?:s|ed|ing)?|clear(?:s|ed|ing)?|skip(?:s|ped|ping)?|replac(?:e|es|ed|ing)|revert(?:s|ed|ing)?)\b/iu;
/** Words that ask for more than undoing what they name. */
const ASKS_MORE = /\b(?:add(?:s|ed|ing)?|insert(?:s|ed|ing)?|tighten(?:s|ed|ing)?|restrict(?:s|ing)?|requir(?:e|es|ing)|enforc(?:e|es|ed|ing)|ensur(?:e|es|ed|ing)|rais(?:e|es|ing)|increas(?:e|es|ing)|lower(?:s|ing)?|decreas(?:e|es|ing)|exclud(?:e|es|ing)|leave\s+out|filter\s+out|dedup\w*|sort(?:s|ing)?|choos(?:e|es|ing)|select(?:s|ing)?|pick(?:s|ing)?|instead|with)\b/iu;

/** The narrowing steps a qualifying advice removes or replaces, each one Core measured as removing no row, and Core's finding for each (header); nothing otherwise. */
export function automationStudioResultAdviceSteps(advice: string | undefined, record: AutomationStudioResultNoRecord): { nodeIds: string[]; findings: string[] } | undefined {
  if (!record.narrowing?.steps.length) return undefined;
  const chosen = new Map<string, string>();
  for (const sentence of automationStudioResultReadingSentences(advice).map(automationStudioResultWithoutConditionWording)) {
    const { steps, others } = automationStudioResultNarrowingStepsNamed(sentence, record);
    if (!steps.length) {
      // A sentence that keeps what it names changes nothing; any other may ask a change Core does not weigh here.
      if (KEEPS.test(sentence) && !UNDOES.test(sentence) && !ASKS_MORE.test(sentence)) continue;
      return undefined;
    }
    if (KEEPS.test(sentence) || !UNDOES.test(sentence) || ASKS_MORE.test(sentence) || others.length) return undefined;
    if (automationStudioResultConditionReferences(sentence).length) return undefined;
    const named = automationStudioResultSentenceRows(sentence, record);
    if (named.stored.length || named.leftOut.length || named.unmatched) return undefined;
    for (const step of steps) {
      const finding = automationStudioResultStepRemovedNoRow(step);
      if (finding === undefined) return undefined;
      chosen.set(step.nodeId, finding);
    }
  }
  return chosen.size ? { nodeIds: [...chosen.keys()], findings: [...chosen.values()] } : undefined;
}
