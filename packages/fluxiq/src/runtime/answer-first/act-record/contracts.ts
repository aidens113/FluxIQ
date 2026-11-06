// The act record's own shapes (plan D6; the interface is fixed in
// `docs/working/answer-first-plan/reports/exploration-path/design.md`).
//
// `AutomationStudioAttemptAct` (`@fluxiq/contracts/automation`) is what a result
// carries. An entry here is that act plus what Core needs to know the act again
// at a later call: which action and target it answers to, and which rows. A
// target and a row are digests, so what is persisted beside a Flow holds no page
// text, no row value and no address. The row map (`rows`) holds hashed words only.

import type { AutomationStudioAttemptAct, AutomationStudioAttemptActClass, AutomationStudioAttemptActState } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../core/index.ts";

export type AutomationStudioAttemptActStage = "exploration" | "forward" | "trial" | "run";

/**
 * What the domain says a call would be, before it is sent: never what happened. It only ever adds
 * to what `admit` refuses and to what an act answers to (`./record.ts`, "Before it is sent").
 */
export type AutomationStudioAttemptActForeseen = {
  /** The words a person reads for what the call names. Hashed before they are compared, and never kept. */
  words?: string;
  /** The frozen parameters it would run with, opaque, read by shape as `ranWith` is (`./identity/target-keys.ts`). */
  parameters?: JsonObject;
};

/** One call about to run, or that ran. */
export type AutomationStudioAttemptActCall = {
  /** The node or tool that acts. */
  actionId: string;
  /** What it was sent. */
  parameters: JsonObject;
  /** Declared classes; `[]` for undeclared. */
  consequences: readonly string[];
  /** An instructed act it claims, if any: a claim makes a call lasting whatever it declared. */
  instructedAct?: string;
  /** The row, when it acts per row. */
  row?: JsonObject;
  stage: AutomationStudioAttemptActStage;
  /** What the domain says it would be, for a call that names its target by a handle. */
  foreseen?: AutomationStudioAttemptActForeseen;
};

export type AutomationStudioAttemptActAdmission =
  | { kind: "run" }
  /** Identical and landed: refuse, no dispatch. `rowsUnclear`: several rows fit, and which this call is on cannot be told from the one done (`./record.ts`, "Rows nobody can tell apart"), so what would help is another thing to say. */
  | { kind: "already_done"; act: AutomationStudioAttemptAct; rowsUnclear?: true }
  /** May have landed and no look since it was last refused: refuse, no dispatch. Saying this is the refusal (`./record.ts`, "A look lifts a hold"). */
  | { kind: "look_first"; act: AutomationStudioAttemptAct };

/** Whether a lasting call may now be sent (`../record.ts`, `begun`). `not_written`: it is not on the persisted record, so it must not be. */
export type AutomationStudioAttemptActBegun = "not_lasting" | "on_record" | "not_written";

/** What became of a call that ran. */
export type AutomationStudioAttemptActOutcome = {
  effectApplied: boolean;
  /** It ran and its effect is not known. */
  uncertain?: boolean;
  /** A person's words for it. Screened; a generic line stands in for anything refused. */
  words: { what: string; where: string };
  /** What the call really ran with, where that differs from what was written: the frozen target a later stage will carry. */
  ranWith?: { actionId?: string; parameters?: JsonObject };
  /** The caller's sentence naming the item of a list the act was on, when it said one. Hashed before it is kept. */
  actedOn?: string;
  /** For a press in no list, the words of the control's own card: what its line names when nothing else does (`./item-names.ts`). Never a row tie, and never kept past this attempt's memory. */
  card?: string;
  /** The Flow step that made it, in a real run: what `doubted` names it by. */
  step?: string;
  /** Its answer says it changed something that stays, not only what is in view: its own control flipped, or a line of the page it stayed on now reads otherwise (`../seed.ts`). */
  changedState?: boolean;
};

/** Where a call's answer left the page: what ties a later by-hand act to a row. */
export type AutomationStudioAttemptActPlaceNote = { location?: string; url?: string; actedOn?: string };

/** One act as the record keeps it. */
export type AutomationStudioAttemptActEntry = AutomationStudioAttemptAct & {
  /** A press with an effect that declared nothing: shown to the model and the judge, left out of a result's acts and of refusals (D6's disclosed limit). */
  undeclared?: true;
  /** A press that declared nothing whose answer says it changed something that stays, not only what is in view (`./seed.ts`). */
  changedState?: true;
  /** Such a press, carried into a later attempt: there it is refused until a look, as a declared act that may have landed is (`./seed.ts`). */
  heldOnRepeat?: true;
  /** Made by an earlier attempt at this task: said as already done, not as this attempt's own (`./seed.ts`). Goes when this attempt does it itself. */
  carried?: true;
  stage: AutomationStudioAttemptActStage;
  /** The names its action answers to. */
  actions: string[];
  /** Digests of the action and target it answers to, under each form it was seen in. */
  keys: string[];
  /** Digests of the handle form alone, kept apart because a handle names one control whichever row a call carries. */
  handleKeys: string[];
  /** Every row it may be on. More than one only where a sentence could not tell them apart. */
  rows: string[];
  /** The rows of the newest read when it was made, where it is on a row of a list and nothing says which: the next read says, by what it changed (`../record.ts`). */
  listBefore?: string[];
  /** A read of that list showed none of its rows changed, so no row is held for it: the known limit that it may be pressed again (`../record.ts`). Counted by `actsWithNoRow`. */
  unmarked?: true;
  /** It was named by a fingerprint: two such acts whose keys differ are two controls, words or none. */
  fingerprinted?: true;
  /** Digests of its control's words, which tell two acts on one row apart. */
  controls?: string[];
  /** A Flow step it is known by (`step:` or `node:`), where a source named only that. */
  steps?: string[];
  /** Whether an observation ran since a call was refused for it. */
  lookedSince: boolean;
  /** How many landings of this act the person's request asks for, where it asks for more than one (`../asked-count/`). Read at its first landing and kept. */
  asked?: number;
  /** How many of those the answers say happened. Present with `asked`. */
  landings?: number;
  at: number;
  /** Hashed words of the sentence naming its item, for a read that comes after it. */
  actedOnWords?: string[];
  /** A hashed path of the page it was made on: for a read that comes after it, and to tell it from the same control on another page. */
  placePath?: string;
};

/** One row a read returned, hashed. */
export type AutomationStudioAttemptActNotedRow = {
  row: string;
  /** Handles printed in the row. */
  handles: string[];
  /** Per text field, its hashed words and those a person tells it by: a word with a letter, or a long number that is an id. `common`: a read held it on more than one row, so it tells no row from another. */
  fields: Array<{ words: string[]; lettered: string[]; common?: true }>;
  /** Hashed paths of the addresses in the row. */
  paths: string[];
  /** Those of `paths` a read held on more than one row. */
  commonPaths?: string[];
  /** The reads it was seen in, newest last and bounded: two rows of one read are never the same row (`./same-row.ts`). None for a row only an act or a run carried. */
  reads?: number[];
};

/** What the record persists: versioned, and read strictly. */
export type AutomationStudioAttemptActRecordData = {
  kind: "attempt_act_record";
  schemaVersion: 1;
  acts: AutomationStudioAttemptActEntry[];
  rows: AutomationStudioAttemptActNotedRow[];
  /** The rows the page in hand belongs to, and that page's hashed path. */
  place?: { rows: string[]; path?: string };
};

/** What a merger hands on for one source act. */
export type AutomationStudioAttemptActMerged = {
  /** The name it goes by in its source, which joins two sources of one act. */
  sourceId: string;
  what: string;
  where?: string;
  classes?: readonly AutomationStudioAttemptActClass[];
  state: AutomationStudioAttemptActState;
  undeclared?: true;
  stage: AutomationStudioAttemptActStage;
  actionId?: string;
  steps?: string[];
  undo?: { how: string };
};
