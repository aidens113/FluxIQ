// What a build left on the target, in a person's words (t567 lane 4).
//
// The site-reset ledger names each act in its own words, for the model and
// the run's evidence: `click "Platform Engineer" link (declared no lasting
// act, but had an effect: possibly lasting)`
// (`flow-bootstrap/site-reset/ledger.ts`). A failed build's chat showed that
// note as it was: every press the build made, the same one four times, an
// overlay's close control as `click "–" div`, and the ledger's terms after
// each. The person needs to know what may have changed something that stays,
// each once, and to be told plainly when nothing did. The ledger's words stay
// in the note the build record and the run's evidence keep
// (`project-agents/supervisor/left-on-target.ts`); these are only what is said.
//
// - An act in place is said as done, with why it cannot be undone where it
//   cannot.
// - A press that declared nothing lasting but changed its page is said apart,
//   as something that changed the page and might have left something behind:
//   never one that only entered text or moved around the page, which saves
//   nothing by itself, and never one named by no word a person reads.
// - Each is said once, by verb and control name, the names under one verb
//   together, and only the latest few by name; the rest are counted.
//
// **Acts no name says are counted, and an act nothing showed is not called a
// change (t738).** Job-board `run-mvgf4pk5-55343613` ended with three open
// presses on nameless controls, each worded "one more change" and then kept
// once, so the chat said "still on the site: one more change", of three acts
// none of which any read showed changing anything. Acts no name says are
// counted (`./act-words.ts`: "3 presses it could not name"), and an act whose
// caller knows no change of it was ever seen (`seen: false`) is said apart, as
// one that may have changed nothing, to check, never as a change still on the site.
//
// **An act the build could not undo is never said to be beyond the site
// (t741 B5).** Photo-social `run-mvgobp8h-b99ede98` ended "These changes the
// build made are still on the site: used “Like” (the site offers no way to undo
// it)", though three later reads showed the control back as it was. A kept act
// (`stays: "kept"`) is one the ledger stopped asking a reset for: the model
// named it under `cannotUndo`, or its undo was refused as aimed at another item.
// It is of a reversible class, so all that is known is that the build could not
// undo it; it is said apart, as one that may still be on the site, to check.
// Only an act of a class no site control takes back (`stays: "irreversible"`,
// the ledger's `undoable: false`) is said as still there because it cannot be
// undone.

import { automationStudioActivityActsSaid, type AutomationStudioActivityActSaid } from "./act-words.ts";

/**
 * One act still in place: the ledger's words, why it stays where it cannot be undone, and `seen: false` when no
 * read after it ever showed a change it made (the ledger's `changeSeen`); absent, a change is assumed.
 */
export type AutomationStudioActivityLeftAct = { did: string; stays?: "irreversible" | "kept"; seen?: boolean };

/** How many acts of each kind are said by name; the rest are counted. */
const MAX_NAMED = 5;

/** Why an act of a class no site control takes back stays, said after it; a kept act is said apart (header, t741 B5). */
const IRREVERSIBLE = "(FluxIQ cannot undo this)";

/** "a", "a and b", "a, b and c"; with `between` "; ", for items that hold commas of their own. */
function joined(items: readonly string[], between = ", "): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(between)}${between === ", " ? "" : ";"} and ${items[items.length - 1]}`;
}

/** `items`, said once each already, the latest `MAX_NAMED` by name and the rest counted. */
function listed(items: readonly string[]): string {
  const named = items.slice(-MAX_NAMED);
  const more = items.length - named.length;
  return joined(more ? [...named, `${more} more`] : named);
}

/** Acts said once each, the names under one verb together ("clicked “A” and “B”"), the latest `MAX_NAMED` by name and the rest counted. */
function grouped(acts: readonly Plain[]): string {
  const once = [...new Map(acts.map((act) => [`${act.verb} ${act.name}`, act])).values()];
  const named = once.slice(-MAX_NAMED);
  const byVerb = new Map<string, string[]>();
  for (const act of named) byVerb.set(act.verb, [...(byVerb.get(act.verb) ?? []), act.name]);
  const more = once.length - named.length;
  // Under one verb the rest are counted among its names ("clicked “A”, “B” and 3 more"); under several, after them.
  const one = byVerb.size === 1;
  const groups = [...byVerb].map(([verb, names]) => `${verb} ${joined(one && more ? [...names, `${more} more`] : names)}`);
  return one ? groups[0] ?? "" : joined(more ? [...groups, `${more} more`] : groups, "; ");
}

type Plain = { verb: string; name: string };

/** Acts in place as phrases for the person (header), each with why it stays. */
function said(acts: readonly AutomationStudioActivityLeftAct[]): AutomationStudioActivityActSaid[] {
  return automationStudioActivityActsSaid(acts.map((act) => ({ did: act.did, note: act.stays === "irreversible" ? IRREVERSIBLE : undefined })));
}

/**
 * What a build left on the target, for the person (header): the acts it knows
 * are still there, or that none are; the acts it could not undo, as ones that
 * may still be there, to check; the acts no change of was ever seen, as
 * ones that may have changed nothing, to check; then the presses that changed the
 * page and might have left something behind.
 */
export function automationStudioActivityLeftTold(acts: readonly AutomationStudioActivityLeftAct[], possibly: readonly { did: string }[]): string {
  const inPlace = said(acts.filter((act) => act.stays !== "kept" && act.seen !== false));
  const kept = said(acts.filter((act) => act.stays === "kept"));
  const quiet = said(acts.filter((act) => act.stays !== "kept" && act.seen === false));
  const sentences = inPlace.length
    ? [`These changes the build made are still on the site: ${listed(inPlace.map((act) => act.words))}.`]
    : kept.length ? [] : ["The build left no change on the site that it knows of."];
  if (kept.length) {
    // Known only to be not undone by the build: never "still there", never "the site offers no way" (header, t741 B5).
    const words = listed(kept.map((act) => (act.counted ? `made ${act.words}` : act.words)));
    const many = kept.length > 1 || kept.some((act) => act.counted && !/^1 /u.test(act.words));
    sentences.push(`The build ${words}, but could not undo ${many ? "them" : "it"}, so ${many ? "they" : "it"} may still be on the site; check ${many ? "them" : "it"} if you need the site exactly as it was.`);
  }
  if (quiet.length) {
    // A count is said as acts it made; a named act by its own verb (header).
    const words = listed(quiet.map((act) => (act.counted ? `made ${act.words}` : act.words)));
    const many = quiet.length > 1 || quiet.some((act) => act.counted && !/^1 /u.test(act.words));
    // Hedged both ways: nothing read showed a change, which is not proof there was none (a save no list was read for).
    sentences.push(`It ${words}, but no read ever showed a change from ${many ? "them" : "it"}, so ${many ? "they" : "it"} may have changed nothing; check ${many ? "them" : "it"} if you need the site exactly as it was.`);
  }
  // A press no word names, or one that only entered text or moved around, is not said (header).
  const changed = automationStudioActivityActsSaid(possibly).flatMap((act) => (act.name !== undefined && !act.passing ? [{ verb: act.verb, name: act.name }] : []));
  if (changed.length) {
    const once = new Set(changed.map((act) => `${act.verb} ${act.name}`)).size;
    sentences.push(`It also ${grouped(changed)}, which changed the page and might have left something behind, so check ${once === 1 ? "it" : "them"} if you need the site exactly as it was.`);
  }
  return sentences.join(" ");
}
