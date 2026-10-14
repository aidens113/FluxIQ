// What this build still has on the target as it ends: every lasting act the
// project ledger holds in place, and whether the last whole trial left acts of
// its own that no reset has undone since. Bigbox `run-mv8186yr-a385fd3a`
// (step 349) ended `blocked` with nine of the build's acts still on the site and
// nobody told; an ending now either follows a reset brief or says, in Core's own
// words, exactly what is left (`./completion.ts`, `./supervisor-loop.ts`).
//
// **Acts no reset can undo are named too (t586).** The ledger's `inPlace` holds
// only acts still to undo, so an act it kept -- one the site offers no control
// to reverse, or whose undo was refused as aimed at another item -- and an act
// of a class no site control takes back (money moved, a message sent) left the
// snapshot as if gone. Social `run-mv85xmgq-8a6a6f43` kept three confirmed
// requests that way. A real project ledger is asked which acts it kept (its
// `claim` answers `candidate.undo_act_kept` for each, and changes nothing), and
// every act of a class no control reverses is still there; each is named with
// why no reset undoes it.
import { AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";
import type { AutomationStudioProjectSupervisorState } from "./state.ts";

/** Each act still on the target, as the ledger names it, and a line for the person when anything is left. */
export type AutomationStudioProjectSupervisorLeftOnTarget = {
  /** `undoable`: a reset brief may still undo it. */
  acts: Array<{ act: string; did: string; brief: string; undoable: boolean }>;
  lastWholeTrialLeftActs: boolean;
  /** Whether a reset brief could undo any of it. */
  undoable: boolean;
  /** Core's line naming everything left, for the ending's reason; undefined when nothing is. */
  note: string | undefined;
  /** An ending's reason with the note after it, within the record's 2000 characters: the model's words give way, never Core's note. */
  reason: (said: string) => string;
};

/** The longest ending reason the build record keeps. */
const MAX_REASON = 2000;

export function automationStudioProjectSupervisorLeftOnTarget(ports: Pick<AutomationStudioProjectSupervisorPorts, "projectLedger">, state: Pick<AutomationStudioProjectSupervisorState, "wholeTrialLeftActs">): AutomationStudioProjectSupervisorLeftOnTarget {
  const ledger = ports.projectLedger;
  const kept = (act: string, owner: string): boolean => {
    if (!(ledger instanceof AutomationStudioSiteResetProjectLedger)) return false;
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
  const lastWholeTrialLeftActs = state.wholeTrialLeftActs;
  const lines = acts.map((act) => act.line);
  if (lastWholeTrialLeftActs) lines.push("the acts the last whole test of the Flow made");
  const note = lines.length ? `Still on the target from this build: ${lines.join("; ")}.` : undefined;
  const fitted = note ? note.slice(0, MAX_REASON - 2) : undefined;
  const reason = (said: string) => (fitted ? `${said.slice(0, MAX_REASON - fitted.length - 1).trimEnd()} ${fitted}`.trim() : said.slice(0, MAX_REASON));
  return { acts: acts.map(({ line: _line, ...act }) => act), lastWholeTrialLeftActs, undoable: lastWholeTrialLeftActs || acts.some((act) => act.undoable), note, reason };
}
