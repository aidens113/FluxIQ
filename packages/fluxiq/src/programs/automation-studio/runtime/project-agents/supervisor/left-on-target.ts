// What this build still has on the target as it ends: every lasting act the
// project ledger holds in place, and whether the last whole trial left acts of
// its own that no reset has undone since. Bigbox `run-mv8186yr-a385fd3a`
// (step 349) ended `blocked` with nine of the build's acts still on the site and
// nobody told; an ending now either follows a reset brief or says, in Core's own
// words, exactly what is left (`./completion.ts`, `./supervisor-loop.ts`).
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";
import type { AutomationStudioProjectSupervisorState } from "./state.ts";

/** Each act still in place, as the ledger names it, and a line for the person when anything is left. */
export type AutomationStudioProjectSupervisorLeftOnTarget = {
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
  const acts = ports.projectLedger.snapshot().acts.filter((act) => act.inPlace).map((act) => ({ act: act.act, did: act.did, brief: act.owner, undoable: act.undoable }));
  const lastWholeTrialLeftActs = state.wholeTrialLeftActs;
  const lines = acts.map((act) => (act.undoable ? act.did : `${act.did} (cannot be undone by FluxIQ)`));
  if (lastWholeTrialLeftActs) lines.push("the acts the last whole test of the Flow made");
  const note = lines.length ? `Still on the target from this build: ${lines.join("; ")}.` : undefined;
  const fitted = note ? note.slice(0, MAX_REASON - 2) : undefined;
  const reason = (said: string) => (fitted ? `${said.slice(0, MAX_REASON - fitted.length - 1).trimEnd()} ${fitted}`.trim() : said.slice(0, MAX_REASON));
  return { acts, lastWholeTrialLeftActs, undoable: lastWholeTrialLeftActs || acts.some((act) => act.undoable), note, reason };
}
