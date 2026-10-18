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

/** One act still in place: the ledger's words, and why it stays where it cannot be undone. */
export type AutomationStudioActivityLeftAct = { did: string; stays?: "irreversible" | "kept" };

/** How many acts of each kind are said by name; the rest are counted. */
const MAX_NAMED = 5;
/** The longest control name said whole. */
const MAX_NAME = 60;

/** The ledger's mark on a possibly lasting act's words. */
const POSSIBLY_MARK = /\s*\(declared no lasting act, but had an effect: possibly lasting\)\s*$/u;
/** A quoted name, as the ledger writes it (JSON). */
const QUOTED = String.raw`"(?:[^"\\]|\\.)*"`;
/** An exploration act: `<verb> "<name>" <kind>`. */
const EXPLORED = new RegExp(String.raw`^([a-z][a-z ]*?) (${QUOTED})(?: [A-Za-z_-]+)?$`, "u");
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

type Plain = { verb: string; name: string; passing: boolean };

/** One act's words for a person, or undefined where nothing a person reads names it. */
function plainAct(did: string): Plain | undefined {
  const bare = did.replace(POSSIBLY_MARK, "").trim();
  const trial = TRIAL.exec(bare);
  if (trial) {
    const name = readable(trial[2] ?? trial[1]);
    return name ? { verb: "used", name, passing: false } : undefined;
  }
  const explored = EXPLORED.exec(bare);
  if (!explored) return undefined;
  const verb = explored[1]!.trim();
  const name = readable(explored[2]);
  return name ? { verb: DONE.get(verb) ?? "used", name, passing: PASSING.test(verb) } : undefined;
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

/** "a", "a and b", "a, b and c"; with `between` "; ", for items that hold commas of their own. */
function joined(items: readonly string[], between = ", "): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(between)}${between === ", " ? "" : ";"} and ${items[items.length - 1]}`;
}

/** `items` said once each, the latest `MAX_NAMED` by name and the rest counted. */
function listed(items: readonly string[]): string {
  const once = [...new Set(items)];
  const named = once.slice(-MAX_NAMED);
  const more = once.length - named.length;
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

/**
 * What a build left on the target, for the person (header): the acts it knows
 * are still there, or that none are, then the presses that changed the page
 * and might have left something behind.
 */
export function automationStudioActivityLeftTold(acts: readonly AutomationStudioActivityLeftAct[], possibly: readonly { did: string }[]): string {
  const inPlace = acts.map((act) => {
    const plain = plainAct(act.did);
    const why = act.stays === "irreversible" ? " (FluxIQ cannot undo this)" : act.stays === "kept" ? " (the site offers no way to undo it)" : "";
    return plain ? `${plain.verb} ${plain.name}${why}` : `one more change${why}`;
  });
  // A press no word names, or one that only entered text or moved around, is not said (header).
  const changed = possibly.map((act) => plainAct(act.did)).filter((plain): plain is Plain => plain !== undefined && !plain.passing);
  const first = inPlace.length
    ? `These changes the build made are still on the site: ${listed(inPlace)}.`
    : "The build left no change on the site that it knows of.";
  if (!changed.length) return first;
  const once = new Set(changed.map((act) => `${act.verb} ${act.name}`)).size;
  return `${first} It also ${grouped(changed)}, which changed the page and might have left something behind, so check ${once === 1 ? "it" : "them"} if you need the site exactly as it was.`;
}
