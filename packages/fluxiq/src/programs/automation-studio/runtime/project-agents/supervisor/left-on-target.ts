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
//
// **The person reads it in plain words (t567 lane 4).** The note above is the
// ledger's words, for the build record and the run's evidence. The chat showed
// it as it was: every press, repeats and all, with "declared no lasting act,
// but had an effect: possibly lasting" after each. What the person is told
// (`told`) says each act that may have changed something lasting once, by verb
// and name, and says plainly when nothing did (`activity/wording/left-told.ts`).
//
// **A kept act is not said to be beyond the site (t741 B5).** An act the
// ledger kept is of a reversible class: the model named it under `cannotUndo`,
// or its undo was refused as aimed at another item. Photo-social
// `run-mvgobp8h-b99ede98` ended on such an act said as "(the site offers no
// way to undo it)" while later reads showed the control back. All that is known
// is that the build could not undo it, so that is what the note says; only an
// act whose class no site control takes back (`undoable: false`) is said as
// one FluxIQ cannot undo.
//
// **The model's words give way at a sentence's end (t741 B5).** An ending's
// reason is the model's words, then the note, within the record's 2000
// characters. The model's words were cut at the character that fitted, so
// office `run-mvgo5xft-25460ba2` recorded "... The part that takes t" and the
// chat said it. They now give way at the last sentence that fits, else at a
// word's end with "…"; a note too long for the record ends on a whole entry.
//
// **An act no call can settle is named as left, and never undoable (t743,
// S2).** Such an act (its brief's ledger's `unsatisfiable()`: its only witness
// a list Core cannot read again, or nothing left to name for it) leaves
// `inPlace`, since no reset is asked to undo it, and so left the ending as if
// gone. Each is named as still on the target, as one that can no longer be
// checked or put back (`unsettleable`), never `undoable`: the reset rule never
// holds an ending for it (`./completion.ts`). The person is told it as an act
// the build could not undo, which may still be there; or, where no read ever
// showed it change anything, as one that may have changed nothing.
import { AUTOMATION_STUDIO_ACTIVITY_NOTHING_LEFT, automationStudioActivityLeftTold, emitAutomationStudioActivity, type AutomationStudioActivityLeftAct } from "../../activity/index.ts";
import { automationStudioProjectBuildReasonNothingChanged } from "../../service/project-build-ending/index.ts";
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";

/** Each act still on the target, as the ledger names it, and a line for the person when anything is left. */
export type AutomationStudioProjectSupervisorLeftOnTarget = {
  /** `undoable`: a reset brief may still undo it. `unsettleable`: no call can check or put it back (header, t743). */
  acts: Array<{ act: string; did: string; brief: string; undoable: boolean; unsettleable?: true }>;
  /** Whether any act left is one no call can settle, so no trial can run while it is there (header, t743). */
  unsettleable: boolean;
  /** Presses that declared no lasting act but changed their page, and may still be on the target (header). */
  possibly: Array<{ act: string; did: string; brief: string }>;
  /** Whether a reset brief could undo any of it. */
  undoable: boolean;
  /** Core's line naming everything left, for the ending's reason; undefined when nothing is. */
  note: string | undefined;
  /** What is left, in a person's words, said even when nothing is (header, `activity/wording/left-told.ts`). */
  told: string;
  /** What Core last read of the pages the build's acts in place were made on, as lines gained and lost (header, t791). */
  readings: Array<{ added: string[]; gone: string[] }>;
  /** An ending's reason with the note after it, within the record's 2000 characters: the model's words give way, never Core's note. */
  reason: (said: string) => string;
  /** Says what is left as a chat row when a build ends with a Flow (header, t785); says nothing when nothing is left. */
  announce: () => void;
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
  const acts: Array<AutomationStudioProjectSupervisorLeftOnTarget["acts"][number] & { line: string; stays?: AutomationStudioActivityLeftAct["stays"]; seen?: boolean; on?: string }> = [];
  const snapshot = ledger.snapshot().acts;
  const wheres = whereActsWereMade(ledger, snapshot);
  // Each brief's acts no call can settle, never in place (header, t743).
  const unsettleable = new Set([...new Set(snapshot.map((act) => act.owner))].flatMap((owner) => ledger.forBrief(owner).unsatisfiable().map((act) => act.act)));
  for (const act of snapshot) {
    const named = { act: act.act, did: act.did, brief: act.owner };
    if (!act.undoable) acts.push({ ...named, undoable: false, line: `${act.did} (cannot be undone by FluxIQ)`, stays: "irreversible" });
    // `seen`: whether any read ever showed it change something, so one nothing showed is not told as a change left (t738).
    else if (act.inPlace) acts.push({ ...named, undoable: true, line: act.did, seen: ledger.forBrief(act.owner).changeSeen(act.act) !== false });
    // Left, and no reset can undo it; told as not undone, or as possibly nothing where no read showed a change (header, t743).
    else if (unsettleable.has(act.act)) acts.push({ ...named, undoable: false, unsettleable: true, line: `${act.did} (it can no longer be checked or put back; it may still be there)`, ...(ledger.forBrief(act.owner).changeSeen(act.act) === false ? { seen: false } : { stays: "kept" as const }) });
    else if (kept(act.act, act.owner)) acts.push({ ...named, undoable: false, line: `${act.did} (the build could not undo it; it may still be there)`, stays: "kept" });
  }
  for (const act of acts) {
    const where = wheres.get(act.act);
    if (where !== undefined) act.on = where;
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
  const told = automationStudioActivityLeftTold(acts.map((act) => ({ did: act.did, ...(act.on !== undefined ? { on: act.on } : {}), ...(act.stays ? { stays: act.stays } : {}), ...(act.seen === false ? { seen: false } : {}) })), possibly);
  // A build that ends with a Flow no longer cleans up (t775): the person is told, in generic words, which of its own acts remain; nothing extra when none do (t785).
  const announce = () => {
    if (told === AUTOMATION_STUDIO_ACTIVITY_NOTHING_LEFT) return;
    emitAutomationStudioActivity({ phase: "verifying", label: "Left on the site", detail: { kind: "note", title: "Left on the site", status: "succeeded", text: told } });
  };
  // Read once, as the ending is made: the latest reads at that moment (header, t791).
  const readings = readingsOfPagesLeft(ledger);
  const fitted = note ? noteWithin(note, MAX_REASON - 2) : undefined;
  const reason = (said: string) => {
    // The ending is being named: the build hears what is left in Core's words (header).
    ports.leftAtEnding?.({ note, told, readings });
    // The model cannot know what the build left; where the ledger holds anything, its "nothing changed" gives way (t791, fix 5b).
    const own = note ? automationStudioProjectBuildReasonNothingChanged(said) : said;
    return fitted ? `${saidWithin(own, MAX_REASON - fitted.length - 1)} ${fitted}`.trim() : saidWithin(own, MAX_REASON);
  };
  return { acts: acts.map(({ line: _line, stays: _stays, seen: _seen, on: _on, ...act }) => act), unsettleable: acts.some((act) => act.unsettleable === true), possibly, undoable: acts.some((act) => act.undoable), note, told, readings, reason, announce };
}

/**
 * Where each act left was made (header, t796): each brief's ledger says, in the order it holds its acts, the page of every
 * act of the build still on the site (`trialChange().leftFromEarlier()`). The same words made twice -- one press of one
 * control on two pages -- are matched in that order, so two holds left on two books are told as two.
 */
function whereActsWereMade(ledger: AutomationStudioProjectSupervisorPorts["projectLedger"], snapshot: ReadonlyArray<{ act: string; did: string; owner: string }>): Map<string, string> {
  const made = new Map<string, string>();
  for (const owner of new Set(snapshot.map((act) => act.owner))) {
    const held = ledger.forBrief(owner).trialChange().leftFromEarlier();
    const used = new Set<number>();
    for (const act of snapshot.filter((entry) => entry.owner === owner)) {
      const at = held.findIndex((entry, index) => !used.has(index) && (entry.did === act.did || entry.did.startsWith(`${act.did} (`)));
      if (at < 0) continue;
      used.add(at);
      const where = held[at]!.where;
      if (where !== undefined) made.set(act.act, where);
    }
  }
  return made;
}

/** `said` within `max`: whole, else up to the last sentence end that fits, else cut at a word's end with "…" (header, t741 B5). */
function saidWithin(said: string, max: number): string {
  const text = said.trim();
  if (text.length <= max) return text;
  if (max <= 1) return "";
  // A sentence's end is read off the whole text, so a cut inside "3.5" or "e.g" is no end.
  const sentence = Math.max(0, ...[...text.matchAll(/[.!?…](?=\s)/gu)].map((found) => found.index + 1).filter((end) => end <= max));
  if (sentence > 0) return text.slice(0, sentence);
  const word = text.slice(0, max - 1);
  const space = text.charAt(max - 1) === " " ? max - 1 : word.lastIndexOf(" ");
  return space > 0 ? `${word.slice(0, space).trimEnd().replace(/[,;:]+$/u, "")}…` : "";
}

/** Core's note within `max`, ending on a whole entry ("; and more.") where it must give way (header). */
function noteWithin(note: string, max: number): string {
  if (note.length <= max) return note;
  const cut = note.slice(0, max - "; and more.".length);
  const end = cut.lastIndexOf("; ");
  return `${end > 0 ? cut.slice(0, end) : cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}; and more.`;
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

/**
 * What Core last read of every page an act of the build in place was made on (header, t791): each brief's ledger knows
 * where its acts in place were made (`trialChange().leftFromEarlier()`) and holds the latest read it took of every page
 * (`latest`, a list place with no group reading the latest read at that location, `flow-bootstrap/trial-change/read-log.ts`).
 * Per page, once, in the order the acts were made: the lines that read shows beyond how the build found the page, and the
 * ones it lost, so the ending can say them (`service/project-build-ending/readings-told.ts`) and drop a claim they
 * contradict. A page never read since the build began, or one that differs from its start by no line, gives nothing.
 */
function readingsOfPagesLeft(ledger: AutomationStudioProjectSupervisorPorts["projectLedger"]): Array<{ added: string[]; gone: string[] }> {
  const pages = new Set<string>();
  const readings: Array<{ added: string[]; gone: string[] }> = [];
  for (const owner of new Set(ledger.snapshot().acts.map((act) => act.owner))) {
    const port = ledger.forBrief(owner).trialChange();
    for (const act of port.leftFromEarlier()) {
      if (act.where === undefined || pages.has(act.where)) continue;
      pages.add(act.where);
      const lines = port.latest({ kind: "list", group: "", location: act.where })?.reading.lines;
      if (lines && (lines.added.length || lines.gone.length)) readings.push({ added: [...lines.added], gone: [...lines.gone] });
    }
  }
  return readings;
}
