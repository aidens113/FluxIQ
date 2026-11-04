// An action card in words, for its view and for anyone who cannot see it:
//
//   name     Core's short name for the act ("Choose", "Tick", "Next page")
//            where it is narrower than the kind, else for the kind ("Click",
//            "Robot check"): an option chosen read "Click" (lane A U1); for a
//            step of a test run, "Testing: Click", since the step is named by
//            its action and the test is what it was part of: every test step
//            read "Test run · ×" (t174-w85 D4, `run-murwd8le-79e735a8`)
//   target   what it acted on or looked for: the control's name Core gave, or
//            the words a look searched for; nothing when Core named none. It
//            never says "the page": "Click · the page" and "Action · the
//            page" said nothing a person could tell apart (t193,
//            `run-muqiojz4-04a7a8fc`), and the message above the card says
//            what the step did. A target of several words that is longer
//            than the head holds is shown whole and the view wraps it at its
//            spaces (`whole`): cut to the head, the same label read "wait …
//            be accepted · Jonas Weber" on one row and "wait … to be accepted
//            · Lin Zhao" on the next, and the view's own cut at the end read
//            "friend requests pa…" (round 12, lane D, `run-mv62icw0-070f88ad`).
//            Only one past `WRAP_ROOM` is cut, from the middle, keeping its
//            first word and as many of its last as fit, so the words that
//            tell two cards apart stay on screen: two test cards read
//            "Testing: Click · ValueRidge Everyday Di…", the 3-Pack and the
//            single pack alike (t193 1003, D8). Every cut falls where a word
//            ends, never inside one ("Hybr…"). A list Core names as "name, price, rating
//            and 3 more" is never cut or renamed: renamed to fit, one list
//            read "name, price and 4 more" on its card, "name and 5 more" on
//            its test card and "name, price, rating and 3 more" on the
//            overlay (R2-U-8 of the run-muwansvz-a2b4a987 UI review). A
//            read's target is that name whatever its shape, so "name and
//            mutualFriends" is kept whole too (U-R3-1, run-mux6nxst). It is
//            shown as Core gave it, and `whole` tells the view to wrap it
//            when it is longer than the head holds. A path with no
//            spaces is cut where one of its parts ends ("…napkins-250"); one
//            word with nowhere to cut is left whole for the view
//   outcome  "Working on it" and "Waiting for you" only while it is the
//            action of the moment (the newest of work still under way);
//            "Done", or "Done: 13 rows from 5 pages" when Core said what a
//            finished action came to (its `result`), "Already done" for a
//            run step Core skipped because this run had already done its act
//            (`already-done.ts`), "Passed", "Didn't work:
//            it wasn't on the page",
//            "Didn't pass: no price was shown"; "Not confirmed: ..." for a
//            result check Core could not confirm, which is no failure: an
//            unverified run that met its task read "Didn't pass" in red
//            (t174-w85 D1); for a step of a test of the Flow that it did not
//            simply do again, Core's words for what it did instead: "Checked,
//            not pressed", "Already done on the site", "Skipped: not there,
//            optional" (t193 1002-M, C10: all of them read "Done", and the
//            skipped one "Didn't work"), with what it came to after a dash
//            when Core said; for a wait on the person
//            that Core settled, its sentence: "Done. You pressed Continue.",
//            "Didn't work: you pressed Stop"; for a decision Core declined
//            before doing it, "Not done: that step is already in the Flow",
//            or "Only partly done: ..." for an edit some of which landed --
//            never "Didn't work", since nothing was tried and failed (t193
//            1003, C13), and never "Done" or "Working on it", whatever outcome
//            the card carries: a refusal is no work (U-8 of the
//            run-muw60j7c-bb7c9a62 UI review). Identical refusals and
//            failures repeated with nothing new between them are one card
//            that says how many ("Not done (3 times): ...", "Didn't work (3
//            times): ...", `card-repeats.ts`); nothing for an action that never said it ended
//            once the work moved on
//   label    all three in one line, for the card's accessible name, with the
//            whole target
//
// `state` drives the card's mark: `settled` is an action that never said how
// it went, `unconfirmed` a result check that neither passed nor failed, and
// `refused` a decision Core declined, neither of which takes a failure's
// colour. No DOM.

import { ACTIVITY_ACTION_NAMES } from "fluxiq/ui";
import { longestWordCut } from "fluxiq/ui";
import type { ActionCard } from "./action-card.ts";

/** The card's words and the state its mark shows. */
export type CardWords = {
  state: "working" | "waiting" | "done" | "failed" | "unconfirmed" | "refused" | "settled";
  name: string;
  target: string | null;
  /** The target is shown whole though the head holds less of it (Core's name for a list): the view wraps it, never cuts it. */
  whole: boolean;
  outcome: string | null;
  label: string;
};

/**
 * The most characters the card's first line holds, name and target together,
 * before the view would cut it: what the 360-pixel side panel showed of
 * "Testing: Click · ValueRidge Everyday Di…" (t193 1003, D8).
 */
const HEAD_ROOM = 36;
/** The least room a target is given, whatever its name's length. */
const MIN_TARGET_ROOM = 16;
/**
 * The most characters a target of several words is shown with, wrapped by the
 * view: a few lines of the side panel. Longer than that it is cut from the
 * middle where words end.
 */
const WRAP_ROOM = 120;

/** `card` in words; `current` is true while it is the action of the moment. */
export function cardWords(card: ActionCard, current: boolean): CardWords {
  const kind = card.name ?? ACTIVITY_ACTION_NAMES[card.kind] ?? ACTIVITY_ACTION_NAMES.other;
  const name = card.testing ? `Testing: ${kind}` : kind;
  const target = card.target;
  const [state, outcome] = outcomeOf(card, current);
  const label = [target === null ? name : `${name}, ${target}`, outcome].filter((part) => part !== null).join(": ");
  const room = Math.max(MIN_TARGET_ROOM, HEAD_ROOM - name.length);
  // A read's target is Core's name for its list, whatever its shape: a list of two fields is
  // named by both ("name and mutualFriends"), and cut, its test card read "Testing: Read list ·
  // name and…" (U-R3-1 of run-mux6nxst-c9bca37c).
  const list = target !== null && (card.kind === "read" || LIST.test(target));
  if (target === null) return { state, name, target: null, whole: false, outcome, label };
  // A target of several words wraps at its spaces rather than being cut to the head; one word
  // with no spaces (a path) cannot wrap there, so it is cut where one of its parts ends.
  const wraps = list || /\s/u.test(target.trim());
  const shown = list ? target : wraps ? wrapped(target, room) : shortened(target, room);
  return { state, name, target: shown, whole: wraps && shown.length > room, outcome, label };
}

function outcomeOf(card: ActionCard, current: boolean): [CardWords["state"], string | null] {
  // A decision Core declined is no work, done or under way, whatever its outcome says.
  if (card.refused !== undefined && card.outcome !== "waiting") {
    const { all, because } = card.refused;
    if (all) return ["refused", joined(counted("Not done", card.times), because)];
    // What landed first, then what did not and why: the refusal alone read as the work done
    // ("Only partly done: that step is already in the Flow", run-mux6naez-6c20f26e, moment 05).
    const landed = resultOf(card);
    return ["done", landed === undefined ? joined(counted("Only partly done", card.times), because) : `${counted("Only partly done", card.times)}: ${lowerFirst(landed)}${because.trim() ? `; not done: ${lowerFirst(because.trim())}` : ""}`];
  }
  switch (card.outcome) {
    case "working":
      return current ? ["working", "Working on it"] : ["settled", null];
    case "waiting":
      // Only Core's resolved row ends a wait (`resolution`, including
      // `cancelled` when the work stops first), never the work moving on.
      return ["waiting", "Waiting for you"];
    case "done":
      // Identical successful cards in a row are one that counts them (`card-repeats.ts`): "Done (5 times)".
      if (card.answer !== undefined) return ["done", `${counted("Done", card.times)}. ${card.answer}`];
      // A step whose act this run had already done: skipped, and no failure (`already-done.ts`).
      if (card.already) return ["done", counted("Already done", card.times)];
      if (card.tested !== undefined) return ["done", resultOf(card) === undefined ? counted(card.tested, card.times) : `${counted(card.tested, card.times)} — ${resultOf(card)}`];
      if (card.retried !== undefined) return ["done", retriedWords(card.retried, resultOf(card))];
      return ["done", card.check ? joined(counted("Passed", card.times), card.said) : joined(counted("Done", card.times), resultOf(card))];
    case "failed":
      if (card.unconfirmed) return ["unconfirmed", joined("Not confirmed", card.said)];
      if (card.why === null && card.answer !== undefined) return ["failed", `${counted("Didn't work", card.times)}. ${card.answer}`];
      return [card.superseded ? "settled" : "failed", joined(counted(card.check ? "Didn't pass" : "Didn't work", card.times), card.why ?? card.said)];
  }
}

/**
 * A step that worked when tried again, as one card (`retried.ts`): "Done
 * on the 2nd try. The first try didn't work: the site asked FluxIQ to slow
 * down", with what it came to after "Done on the 2nd try" when Core said.
 */
function retriedWords(retried: NonNullable<ActionCard["retried"]>, result: string | undefined): string {
  const done = joined(`Done on the ${ordinal(retried.tries)} try`, result);
  const before = retried.tries === 2 ? "The first try didn't work" : `The first ${retried.tries - 1} tries didn't work`;
  return `${done}. ${joined(before, retried.why)}`;
}

/** 2 is "2nd", 3 "3rd", 11 "11th", 22 "22nd". */
function ordinal(count: number): string {
  const tens = count % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : count % 10 === 1 ? "st" : count % 10 === 2 ? "nd" : count % 10 === 3 ? "rd" : "th";
  return `${count}${suffix}`;
}

/**
 * What a finished action came to, as Core said it; undefined when it said
 * nothing. A card standing for several identical ones says it is each one's
 * result: "Done (2 times): 7 rows from 1 page" read as one read of one page,
 * when the playback had read two pages, one per read (t785,
 * `run-mvskodlp-9966d618`), so it reads "Done (2 times): each time, 7 rows
 * from 1 page".
 */
function resultOf(card: ActionCard): string | undefined {
  const said = card.result?.trim();
  if (!said) return undefined;
  return card.times !== undefined && card.times > 1 ? `each time, ${lowerFirst(said)}` : said;
}

/** "Not done (3 times)", "Didn't work (3 times)" for a card standing for several identical ones (`card-repeats.ts`). */
function counted(head: string, times: number | undefined): string {
  return times !== undefined && times > 1 ? `${head} (${times} times)` : head;
}

/** A test's typing step's target, the words typed and then the field (Core's `activityActionOf`): '"3" into Quantity'. */
const TYPED = /^"(.*)" into (.+)$/su;
/** The least room the words typed keep before the field is left out. */
const MIN_TYPED_ROOM = 12;

/** Core's name for a list of more items than it names: "name, price, rating and 3 more". Shown as Core gave it. */
const LIST = /^.+ and \d+ more$/u;

/**
 * A target within `room` characters. Words typed into a field are what tell
 * two typing cards apart, so a typed target keeps them, cut from the middle
 * if it must, and leaves out the field when both do not fit (the field is in
 * the card's label, and the decision above it says it). Any other target is
 * cut from the middle (`cutMiddle`).
 */
function shortened(text: string, room: number): string {
  if (text.length <= room) return text;
  const typed = TYPED.exec(text);
  if (!typed) return cutMiddle(text, room);
  const into = ` into ${typed[2]!}`;
  const withField = room - 2 - into.length;
  return withField >= MIN_TYPED_ROOM ? `"${cutMiddle(typed[1]!, withField)}"${into}` : `"${cutMiddle(typed[1]!, room - 2)}"`;
}

/**
 * A target of several words, for the view to wrap: whole when it fits the
 * head; else the words typed alone for a typing step, the field left out as
 * `shortened` leaves it (the card's label keeps it); and either cut from the
 * middle where words end only past `WRAP_ROOM`.
 */
function wrapped(text: string, room: number): string {
  if (text.length <= room) return text;
  const typed = TYPED.exec(text);
  return typed ? `"${cutMiddle(typed[1]!, WRAP_ROOM - 2)}"` : cutMiddle(text, WRAP_ROOM);
}

/** Where a word with no spaces may be cut: before each of its separators ("/", "-", "_", "."). */
const PART = /(?=[/\-_.])/u;
/** A separator a part kept after the ellipsis opens with. */
const LEADING_SEPARATOR = /^[/\-_.]/u;

/**
 * `text` within `room` characters, cut from the middle where words end: its
 * first word when that takes at most half the room, then as many of its last
 * words as fit, then more of its first words if any room is left, joined by
 * " … ". When its last word alone does not fit, its first words that do, then
 * an ellipsis; when not even its first word does, one word is cut the same
 * way where one of its parts ends, and a word with no parts is left whole.
 */
function cutMiddle(text: string, room: number): string {
  if (text.length <= room) return text;
  const words = text.split(" ").filter(Boolean);
  const middle = keepEnds(words, " ", room);
  if (middle !== undefined) return middle;
  const start = longestWordCut(text, (candidate) => candidate.length <= room);
  if (start !== null) return start;
  const parts = text.split(PART);
  return (parts.length > 1 ? keepEnds(parts, "", room) : undefined) ?? text;
}

/**
 * `pieces` joined by `joiner` within `room` characters: the first piece when
 * it takes at most half the room, as many of the last as fit, then more of the
 * first; undefined when the last piece alone does not fit.
 */
function keepEnds(pieces: readonly string[], joiner: string, room: number): string | undefined {
  // What stands for the words, or the parts of a word, a cut leaves out.
  const gap = joiner === "" ? "…" : " … ";
  const first = pieces[0] ?? "";
  const head: string[] = pieces.length > 1 && first.length <= room / 2 ? [first] : [];
  const tail: string[] = [];
  const length = (start: readonly string[], end: readonly string[]): number => start.join(joiner).length + (start.length ? gap.length : 1) + end.join(joiner).length;
  for (let index = pieces.length - 1; index >= head.length; index -= 1) {
    if (length(head, [pieces[index]!, ...tail]) > room) break;
    tail.unshift(pieces[index]!);
  }
  if (!tail.length) return undefined;
  for (let index = head.length; index < pieces.length - tail.length; index += 1) {
    if (length([...head, pieces[index]!], tail) > room) break;
    head.push(pieces[index]!);
  }
  // A part kept after the ellipsis does not open with the separator it was cut at ("…napkins-250").
  const end = joiner === "" ? tail.join("").replace(LEADING_SEPARATOR, "") : tail.join(joiner);
  return head.length ? `${head.join(joiner)}${gap}${end}` : `…${end}`;
}

function joined(head: string, reason: string | null | undefined): string {
  const said = reason?.trim();
  return said ? `${head}: ${lowerFirst(said)}` : head;
}

/**
 * "The field was covered." reads "the field was covered." after a colon; "URL"
 * or "PIN" stays as it is, and so does a name with a capital inside its first
 * word, such as "FluxIQ" (t194 lead: "FluxIQ didn't send it" read "fluxIQ").
 */
function lowerFirst(sentence: string): string {
  const [first, second] = [sentence.charAt(0), sentence.charAt(1)];
  const word = /^\S+/u.exec(sentence)?.[0] ?? "";
  if (/\p{Lu}/u.test(word.slice(1))) return sentence;
  return second !== "" && second === second.toLowerCase() && second !== second.toUpperCase() ? first.toLowerCase() + sentence.slice(1) : sentence;
}
