// One lasting act of this build as the site-reset ledger keeps it
// (`./ledger.ts`), moved out of that file whole (t743) because the ledger and
// the undo claims it hands its acts to (`./undo-claims.ts`) both read and
// write it. Never shown to a model as it is: `./ledger.ts` names an act
// through `namedAct`.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetPress } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetPlace, AutomationStudioSiteResetSpot } from "./contracts.ts";
import type { AutomationStudioSiteResetControlOriginal } from "./control-witnesses.ts";

/** One act of this build, as the ledger records, judges and undoes it (header). */
export type AutomationStudioSiteResetLedgerAct = {
  id: string;
  did: string;
  /** The exploration call, or the trial step, that made it. */
  ref: string;
  /** The exploration call's id, as the model gave it; absent for a trial's act. */
  call?: string;
  /** The name of the control the exploration call acted on, as the gate carried it; absent when withheld or for a trial's act (t647). */
  control?: string;
  operation?: string;
  /** The lasting classes it declared: what an undo tied to it by subject may reverse (header, t719). */
  consequences: readonly AutomationStudioActionConsequence[];
  undoable: boolean;
  /** Subject-bearing effects require positive baseline restoration, never an ordinary trial on leftovers. */
  strictReset: boolean;
  undone: boolean;
  /** The call that last tried to undo it, as the model gave its id. */
  undoneBy?: string;
  /** Undo calls of it that landed. */
  attempts: number;
  /** Whether a landed undo changed the page it ran on and stayed there: unknown when no read was made. */
  undoChanged?: boolean;
  /** An unasked removal of what it created landed: spent. */
  spent: boolean;
  /** Destination whose witnessed-new subject a removal must make absent. */
  subjectUndo?: { scope: string; subject: string; group: string; origin?: string };
  /** A pure transition witnessed immediately around this effect; later reset reads cannot manufacture it. */
  transfer?: { origin: string; scope: string; group: string; subject: string; state: string };
  /** Every list named as where its effect would show (F1, L1): on its own call, on a look under `undoes`, or admitted against. Accumulated, never removed. */
  destinations: Array<{ scope: string; group: string }>;
  /** The explored acts a trial act repeats: their destinations, named whenever, cover it too (header, L1). */
  repeats: string[];
  /** Those destinations as last gathered, refreshed whenever an undo of it is put to the admission (`./undo-admission.ts`, t743). */
  lent?: Array<{ scope: string; group: string }>;
  /** The ledger clock it landed at: a read counts for it only from then on. */
  clock: number;
  /** Its own press, until the read after it says whether it was a toggle (L1). */
  press?: AutomationStudioSiteResetPress;
  controlOriginal?: AutomationStudioSiteResetControlOriginal;
  /** One control at its place flipped from `from` to `to` (L1); only for an act that declared exactly `modify_existing`. */
  toggle?: { page: string; place: string; from: string; to: string };
  /** Its own control answered a state that is neither the build's nor the act's, so it cannot be pressed back (`./undo-reach.ts`, t748); cleared once a press back is admitted. */
  pressBackRefused?: true;
  /** A read after it showed one of its witnesses changed. */
  changeSeen: boolean;
  /** Settled, for good (header, L1): `restored` also marks it undone. */
  settled?: "restored" | "unchanged";
  /** Settled with lists named for it that Core could not read again: their refs, told to every later trial's judge (header, t743). */
  unread?: string[];
  /** Its own page before it, and what it changed there. */
  place?: AutomationStudioSiteResetPlace;
  /** Where the control it acted on sat; absent when that is not known (a trial's act whose step's diff gave none, t598). */
  spot?: AutomationStudioSiteResetSpot;
  /** The items it created, as its own page showed them (t475), a trial step's read off its own diff (t598). */
  createdItems: string[];
  /** In this phase an undo of it landed on its own item (`own`, or one about the same thing, t719) or on one it created (`created`): a dialog that follows may confirm it. */
  chain?: "own" | "created" | undefined;
  /** What it changed that was still there when the reset last looked. */
  stillThere?: string[];
  /** Reset refusals that named it. */
  askedFor: number;
  /** The site cannot undo it: every trial runs with it in place. */
  kept: boolean;
  /** It declared no lasting class, but had an effect: possibly lasting, never asked for (header, t593). */
  possible: boolean;
};
