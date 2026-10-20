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
// presses apart from other acts, so three stay three ("3 presses it could not
// name"). A note said after an act (why it cannot be undone) is kept with it,
// and acts with different notes are never counted together.

/**
 * One phrase for the person: a named act (`clicked “Save”`, with its verb and
 * name), or a count of acts no name says (`3 presses it could not name`,
 * `counted`, with no name). `passing`: it only entered text or moved around the
 * page, which saves nothing by itself.
 */
export type AutomationStudioActivityActSaid = { words: string; counted: boolean; verb: string; name: string | undefined; passing: boolean };

/** The longest control name said whole. */
const MAX_NAME = 60;

/** The ledger's mark on a possibly lasting act's words. */
const POSSIBLY_MARK = /\s*\(declared no lasting act, but had an effect: possibly lasting\)\s*$/u;
/** A quoted name, as the ledger writes it (JSON). */
const QUOTED = String.raw`"(?:[^"\\]|\\.)*"`;
/** An exploration act: `<verb> "<name>" <kind>`. */
const EXPLORED = new RegExp(String.raw`^([a-z][a-z ]*?) (${QUOTED})(?: [A-Za-z_-]+)?$`, "u");
/** An exploration act on a control no name was given for: `<verb> <kind>` (`click span`). */
const NAMELESS = /^([a-z][a-z ]*?) [A-Za-z_-]+$/u;
/** A trial step's act: `trial step <n> "<label>"|<id> on "<control>"`. */
const TRIAL = new RegExp(String.raw`^trial step \d+ (?:(${QUOTED})|\S+)(?: on (${QUOTED}))?$`, "u");

/** A verb as the person reads it, done; any other is "used". */
const DONE: ReadonlyMap<string, string> = new Map([
  ["click", "clicked"], ["press", "clicked"], ["tap", "tapped"], ["double click", "double-clicked"], ["open", "opened"], ["submit", "submitted"],
  ["select", "chose"], ["choose", "chose"], ["check", "ticked"], ["uncheck", "unticked"], ["toggle", "switched"], ["switch", "switched"],
  ["add", "added"], ["save", "saved"], ["remove", "removed"], ["delete", "deleted"], ["upload", "uploaded"], ["confirm", "confirmed"], ["send", "sent"]
]);
/** Verbs that only enter text or move around the page: nothing they do stays by itself. */
const PASSING = /^(?:type(?: text)?|fill|clear|key|press key|scroll|hover|focus|wait|look|read|navigate|go to)$/u;
/** Verbs that press a control. */
const PRESSING = /^(?:click|press|tap|double click)$/u;

type Plain = { verb: string; name: string | undefined; passing: boolean; press: boolean };

/** Each named act once, in the order made, then the acts no name says, counted (header); each with its `note` after. */
export function automationStudioActivityActsSaid(acts: readonly { did: string; note?: string | undefined }[]): AutomationStudioActivityActSaid[] {
  const named = new Map<string, AutomationStudioActivityActSaid>();
  const unnamed = new Map<string, { count: number; plain: Plain; note: string }>();
  for (const act of acts) {
    const plain = plainAct(act.did);
    const note = act.note ? ` ${act.note}` : "";
    if (plain.name) {
      const words = `${plain.verb} ${plain.name}${note}`;
      if (!named.has(words)) named.set(words, { words, counted: false, verb: plain.verb, name: plain.name, passing: plain.passing });
      continue;
    }
    const key = `${plain.press ? "press" : "act"}${note}`;
    unnamed.set(key, { count: (unnamed.get(key)?.count ?? 0) + 1, plain, note });
  }
  const counted = [...unnamed.values()].map(({ count, plain, note }) => {
    const noun = plain.press ? (count === 1 ? "press" : "presses") : count === 1 ? "act" : "acts";
    return { words: `${count} ${noun} it could not name${note}`, counted: true, verb: plain.verb, name: undefined, passing: plain.passing };
  });
  return [...named.values(), ...counted];
}

/** One act's words for a person (header): never the ledger's own terms. */
function plainAct(did: string): Plain {
  const bare = did.replace(POSSIBLY_MARK, "").trim();
  const trial = TRIAL.exec(bare);
  if (trial) return { verb: "used", name: readable(trial[2] ?? trial[1]), passing: false, press: false };
  const explored = EXPLORED.exec(bare) ?? NAMELESS.exec(bare);
  if (!explored) return { verb: "used", name: undefined, passing: false, press: false };
  const verb = explored[1]!.trim();
  return { verb: DONE.get(verb) ?? "used", name: readable(explored[2]), passing: PASSING.test(verb), press: PRESSING.test(verb) };
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
