// What this build still has on the target as it ends: every lasting act the
// project ledger holds in place. Bigbox `run-mv8186yr-a385fd3a`
// (step 349) ended `blocked` with nine of the build's acts still on the site and
// nobody told; an ending now either follows a reset brief or says, in Core's own
// words, exactly what is left (`./completion.ts`, `./supervisor-loop.ts`).
//
// **Acts no reset can undo are named too (t586).** The ledger's `inPlace` holds
// only acts still to undo, so an act it kept -- one the site offers no control
// to reverse, or whose undo was refused as aimed at another item -- and an act
// of a class no site control takes back (money moved, a message sent) left the
// snapshot as if gone. Social `run-mv85xmgq-8a6a6f43` kept three confirmed
// requests that way. Each brief's ledger is asked which acts it kept (its
// `claim` answers `candidate.undo_act_kept` for each, and changes nothing), and
// every act of a class no control reverses is still there; each is named with
// why no reset undoes it.
//
// **The person is told it in Core's words alone (t590).** When an ending's
// reason is made (`reason`), the build is told what is left as Core named it
// (`ports.leftAtEnding`), so a failed build's chat message can say it without
// the model's own words, which the reason also holds
// (`service/project-build/run.ts`).
//
// **Possibly lasting presses are named as possibly there (t597).** A press
// that declared no lasting act but changed its page is recorded as possibly
// lasting (t593, `flow-bootstrap/site-reset/ledger.ts`): never asked for,
// never in place. A phase start names the latest of them, but an ending did
// not, so A8 crossborder's coupon press, which no start hook took back, ended
// under "Nothing this build did is still on the target". Each brief's ledger
// answers those it may still hold (`possiblyInPlace`); one a start hook or an
// undo has since taken back is not among them. They are named apart from the
// acts in place, as possibly still there and never as there, the latest few by
// name and the rest counted, as a phase start names them. Nothing asks a reset
// for them, so they change neither `undoable` nor a reset's due.
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";

/** Each act still on the target, as the ledger names it, and a line for the person when anything is left. */
export type AutomationStudioProjectSupervisorLeftOnTarget = {
  /** `undoable`: a reset brief may still undo it. */
  acts: Array<{ act: string; did: string; brief: string; undoable: boolean }>;
  /** Presses that declared no lasting act but changed their page, and may still be on the target (header). */
  possibly: Array<{ act: string; did: string; brief: string }>;
  /** Whether a reset brief could undo any of it. */
  undoable: boolean;
  /** Core's line naming everything left, for the ending's reason; undefined when nothing is. */
  note: string | undefined;
  /** An ending's reason with the note after it, within the record's 2000 characters: the model's words give way, never Core's note. */
  reason: (said: string) => string;
};

/** The longest ending reason the build record keeps. */
const MAX_REASON = 2000;

/** How many possibly lasting presses are named; the rest are counted (header), as a phase start names them. */
const MAX_POSSIBLY_NAMED = 10;

export function automationStudioProjectSupervisorLeftOnTarget(ports: Pick<AutomationStudioProjectSupervisorPorts, "projectLedger" | "leftAtEnding">): AutomationStudioProjectSupervisorLeftOnTarget {
  const ledger = ports.projectLedger;
  const kept = (act: string, owner: string): boolean => {
    const claim = ledger.forBrief(owner).claim(act);
    return claim.kind === "refused" && claim.evidence.code === "candidate.undo_act_kept";
  };
  const acts: Array<AutomationStudioProjectSupervisorLeftOnTarget["acts"][number] & { line: string }> = [];
  for (const act of ledger.snapshot().acts) {
    const named = { act: act.act, did: act.did, brief: act.owner };
    if (!act.undoable) acts.push({ ...named, undoable: false, line: `${act.did} (cannot be undone by FluxIQ)` });
    else if (act.inPlace) acts.push({ ...named, undoable: true, line: act.did });
    else if (kept(act.act, act.owner)) acts.push({ ...named, undoable: false, line: `${act.did} (the site offers no way to undo it)` });
  }
  const lines = acts.map((act) => act.line);
  const possibly = possiblyLeft(ledger);
  const named = possibly.slice(-MAX_POSSIBLY_NAMED);
  const leftOut = possibly.length - named.length;
  const sentences = [
    lines.length ? `Still on the target from this build: ${lines.join("; ")}.` : "",
    named.length ? `Possibly still on the target, though nothing checked: ${named.map((act) => act.did).join("; ")}${leftOut ? `; and ${leftOut} earlier such ${leftOut === 1 ? "press" : "presses"}` : ""}.` : ""
  ].filter((sentence) => sentence);
  const note = sentences.length ? sentences.join(" ") : undefined;
  const fitted = note ? note.slice(0, MAX_REASON - 2) : undefined;
  const reason = (said: string) => {
    // The ending is being named: the build hears what is left in Core's words (header).
    ports.leftAtEnding?.({ note });
    return fitted ? `${said.slice(0, MAX_REASON - fitted.length - 1).trimEnd()} ${fitted}`.trim() : said.slice(0, MAX_REASON);
  };
  return { acts: acts.map(({ line: _line, ...act }) => act), possibly, undoable: acts.some((act) => act.undoable), note, reason };
}

/** Every brief's possibly lasting presses that may still be on the target, in the order the build made them (header). */
function possiblyLeft(ledger: AutomationStudioProjectSupervisorPorts["projectLedger"]): AutomationStudioProjectSupervisorLeftOnTarget["possibly"] {
  const acts = ledger.snapshot().acts.filter((act) => act.possible === true);
  const held = new Map<string, Set<string>>();
  const holds = (owner: string, act: string): boolean => {
    let ids = held.get(owner);
    if (!ids) held.set(owner, ids = new Set(ledger.forBrief(owner).possiblyInPlace().map((entry) => entry.act)));
    return ids.has(act);
  };
  return acts.filter((act) => holds(act.owner, act.act)).map((act) => ({ act: act.act, did: act.did, brief: act.owner }));
}
