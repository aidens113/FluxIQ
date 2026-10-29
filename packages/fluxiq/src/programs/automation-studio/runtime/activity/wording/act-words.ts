// Acts of the build in a person's words, each said once (t567 lane 4, t738).
//
// The site-reset ledger names each act in its own words, for the model and the
// run's evidence: `click "Platform Engineer" link (declared no lasting act, but
// had an effect: possibly lasting)`, `trial step 3 "add it" on "Add"`, or
// `click span` for a control no word names (`flow-bootstrap/site-reset/`).
// What a build left (`./left-told.ts`) and what a reset kept
// (`project-agents/dispatch/reset-done.ts`) both say an act by its verb, done,
// and its control's name, never the ledger's terms or its `act-N` id.
//
// **Acts no name says are counted (t738).** Job-board `run-mvgf4pk5-55343613`
// ended with three presses on nameless controls still open, and the chat said
// "These changes the build made are still on the site: one more change": each
// act became the same words, and the list kept each wording once. An act a
// name says is said once by verb and name; those no name says are counted,
// presses apart from other acts, so three stay three ("pressed 3 controls with
// no label"). A note said after an act (why it cannot be undone) is kept with
// it, and acts with different notes are never counted together.
//
// **A trial step is said by what it did, once (t753).** Round 5 read "The
// build used “Unlike”, but could not undo it": a trial step was named by the
// control its press left showing, the reverse of what stayed on the site, and
// "It made 6 acts it could not name" counted three saves twice, once per test
// run, because a looped step's words (`trial step 6, pass 3 of 3 ...`, t748)
// matched no pattern. A trial step is now said by its own label ("ran the step
// “save the note”"), or by the control it ran on where it has none, never as
// "used"; the same step made by another test run is the same act of the Flow
// and is counted once. A press on a link, or on a control that dismisses,
// closes or declines something optional ("Not now", "Close chat", "Decline
// optional cookies"), or moves to another page, is `passing`: it saves nothing
// by itself, so it is never listed as something that may have stayed.
//
// **A trial step that closes something is passing too (t790).** Run
// `run-mvswewhy-e4e469d4`'s build ending said "Left on the site: The build ran
// the step "close the chat window if it shows", which changed the page and might
// have left something behind". A step labelled to close, dismiss, hide or skip
// something, or to decline something optional, is `passing` like the control of
// the same name. An optional cookie "Decline" pressed as a control
// (`run-mvswh11y-9d462629`) carries only its name and kind in the act record, no
// cookie or consent context, so it stays as it was.

/**
 * One phrase for the person: a named act (`clicked “Save”`, with its verb and
 * name), or a count of acts no name says (`pressed 3 controls with no label`,
 * `counted`, with no name). `count` is how many acts it says. `passing`: it
 * saves nothing by itself -- it only entered text or moved around the page,
 * dismissed or closed something, or went to another page (t753).
 */
export type AutomationStudioActivityActSaid = { words: string; counted: boolean; count: number; verb: string; name: string | undefined; passing: boolean };

/** The longest control name said whole. */
const MAX_NAME = 60;

/** The ledger's mark on a possibly lasting act's words. */
const POSSIBLY_MARK = /\s*\(declared no lasting act, but had an effect: possibly lasting\)\s*$/u;
/** A quoted name, as the ledger writes it (JSON). */
const QUOTED = String.raw`"(?:[^"\\]|\\.)*"`;
/** An exploration act: `<verb> "<name>" <kind>`. */
const EXPLORED = new RegExp(String.raw`^([a-z][a-z ]*?) (${QUOTED})(?: ([A-Za-z_-]+))?$`, "u");
/** An exploration act on a control no name was given for: `<verb> <kind>` (`click span`). */
const NAMELESS = /^([a-z][a-z ]*?) ([A-Za-z_-]+)$/u;
/** A trial step's act: `trial step <n>[, pass <i> of <n>] "<label>"|<id> on "<control>"` (t748 passes). */
const TRIAL = new RegExp(String.raw`^trial step \d+(?:, pass \d+ of \d+)? (?:(${QUOTED})|\S+)(?: on (${QUOTED}))?$`, "u");

/** A verb as the person reads it, done; any other is "used". */
const DONE: ReadonlyMap<string, string> = new Map([
  ["click", "clicked"], ["press", "clicked"], ["tap", "tapped"], ["double click", "double-clicked"], ["open", "opened"], ["submit", "submitted"],
  ["select", "chose"], ["choose", "chose"], ["check", "ticked"], ["uncheck", "unticked"], ["toggle", "switched"], ["switch", "switched"],
  ["add", "added"], ["save", "saved"], ["remove", "removed"], ["delete", "deleted"], ["upload", "uploaded"], ["confirm", "confirmed"], ["send", "sent"]
]);
/** Verbs that only enter text or move around the page: nothing they do stays by itself. */
const PASSING = /^(?:type(?: text)?|fill|clear|key|press key|scroll|hover|focus|wait|look|read|navigate|go to)$/u;
/**
 * A trial step labelled for getting around or reading the page, not for changing it ("show more of the feed",
 * "go to the reels page", "find the newest posts"): it saves nothing by itself, so it is never listed as something that
 * may have stayed (t774: "ran the step 'show more of the feed' ... might have left something behind").
 */
const TRIAL_ONLY_MOVES = /^(?:scroll|go to|go back|open the (?:\w+ )?page|navigate|show|see|load|view|next|back|read|look|find|search|browse|collect|get|list)(?![\p{L}\p{N}])/iu;
/**
 * A trial step labelled for dismissing, closing, hiding or skipping something, or declining something optional ("close the
 * chat window if it shows", "decline the optional cookies", "not now"): closing a window is no lasting site change (t790,
 * `run-mvswewhy-e4e469d4`). A bare "decline" or "reject" is not one: it may answer a request.
 */
const TRIAL_DISMISSES = /^(?:(?:close|dismiss|hide|skip)(?![\p{L}\p{N}])|(?:decline|reject|refuse)\b.*\b(?:all|optional|non-essential|tracking|marketing|cookies?|banner|pop-?up)\b|not now(?![\p{L}\p{N}]))/iu;
/** Verbs that press a control. */
const PRESSING = /^(?:click|press|tap|double click)$/u;
/** A link: pressing one goes to another page, which saves nothing by itself (t753). */
const LINK = /^(?:a|link)$/iu;
/**
 * A control that dismisses, closes or declines something optional, or moves
 * to another page (t753): pressing it saves nothing on the site by itself. A
 * bare "Decline" or "Reject" is not one: it may answer a request.
 */
const FLEETING = new RegExp([
  String.raw`\bcookies?\b`, String.raw`^(?:close|dismiss|hide|skip|cancel|not now|no,? thanks|maybe later|remind me later|got it)\b`, String.raw`\bclose\b`,
  String.raw`^(?:reject|decline|refuse)\b.*\b(?:all|optional|non-essential|tracking|marketing)\b`,
  String.raw`^(?:next|previous|prev|back|go back|home|show more|see more|load more|view more)(?: page)?$`, String.raw`^(?:page )?\d+$`, String.raw`^[×✕✖xX›»‹«<>]$`
].join("|"), "iu");

type Plain = { verb: string; name: string | undefined; passing: boolean; press: boolean; trial: boolean };

/**
 * Each named act once, in the order made, then the acts no name says, counted
 * (header); each with its `note` after. A nameless trial step is counted once
 * however many test runs made it: its words name the step (t753).
 */
export function automationStudioActivityActsSaid(acts: readonly { did: string; note?: string | undefined }[]): AutomationStudioActivityActSaid[] {
  const named = new Map<string, AutomationStudioActivityActSaid>();
  const unnamed = new Map<string, { count: number; plain: Plain; note: string; steps: Set<string> }>();
  for (const act of acts) {
    const plain = plainAct(act.did);
    const note = act.note ? ` ${act.note}` : "";
    if (plain.name) {
      const words = `${plain.verb} ${plain.name}${note}`;
      if (!named.has(words)) named.set(words, { words, counted: false, count: 1, verb: plain.verb, name: plain.name, passing: plain.passing });
      continue;
    }
    const key = `${plain.press ? "press" : "act"}${note}`;
    const seen = unnamed.get(key) ?? { count: 0, plain, note, steps: new Set<string>() };
    const step = act.did.replace(POSSIBLY_MARK, "").trim();
    // The same trial step again is the same act of the Flow (header, t753).
    if (plain.trial && seen.steps.has(step)) continue;
    if (plain.trial) seen.steps.add(step);
    unnamed.set(key, { ...seen, count: seen.count + 1 });
  }
  const counted = [...unnamed.values()].map(({ count, plain, note }) => {
    const words = plain.press ? `pressed ${count} ${count === 1 ? "control" : "controls"} with no label` : `took ${count} ${count === 1 ? "step" : "steps"} without a label`;
    return { words: `${words}${note}`, counted: true, count, verb: plain.verb, name: undefined, passing: plain.passing };
  });
  return [...named.values(), ...counted];
}

/**
 * One act's words for a person (header): never the ledger's own terms. A trial
 * step is said by its own label, what it did, never by the control its press
 * left showing, which may say the reverse ("Unlike" after a like, t753).
 */
function plainAct(did: string): Plain {
  const bare = did.replace(POSSIBLY_MARK, "").trim();
  const trial = TRIAL.exec(bare);
  if (trial) {
    const label = readable(trial[1]);
    if (label) return { verb: "ran the step", name: label, passing: TRIAL_ONLY_MOVES.test(label.slice(1, -1)) || TRIAL_DISMISSES.test(label.slice(1, -1)), press: false, trial: true };
    const control = readable(trial[2]);
    return { verb: control ? "ran a step on" : "used", name: control, passing: false, press: false, trial: true };
  }
  const explored = EXPLORED.exec(bare);
  const nameless = explored ? undefined : NAMELESS.exec(bare);
  if (!explored && !nameless) return { verb: "used", name: undefined, passing: false, press: false, trial: false };
  const verb = (explored ?? nameless)![1]!.trim();
  const kind = explored ? explored[3] : nameless![2];
  const name = explored ? readable(explored[2]) : undefined;
  const press = PRESSING.test(verb);
  // Pressing a link, or a control that dismisses, closes or moves on, saves nothing by itself (header, t753).
  const fleeting = press && ((kind !== undefined && LINK.test(kind)) || (name !== undefined && FLEETING.test(name.slice(1, -1))));
  return { verb: DONE.get(verb) ?? "used", name, passing: PASSING.test(verb) || fleeting, press, trial: false };
}

/** A quoted name in curly quotes, or undefined when it holds no letter or digit a person reads. */
function readable(quoted: string | undefined): string | undefined {
  if (!quoted) return undefined;
  const words = quoted.slice(1, -1)
    .replace(/\\u([0-9a-fA-F]{4})/gu, (_whole: string, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\[nrtbf]/gu, " ")
    .replace(/\\(.)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(words)) return undefined;
  return `“${words.length > MAX_NAME ? `${words.slice(0, MAX_NAME - 1).trimEnd()}…` : words}”`;
}
