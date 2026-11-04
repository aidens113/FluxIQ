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
};

export type AutomationStudioAttemptActAdmission =
  | { kind: "run" }
  /** Identical and landed: refuse, no dispatch. */
  | { kind: "already_done"; act: AutomationStudioAttemptAct }
  /** May have landed and no look since: refuse, no dispatch. */
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
  /** The Flow step that made it, in a real run: what `doubted` names it by. */
  step?: string;
};

/** Where a call's answer left the page: what ties a later by-hand act to a row. */
export type AutomationStudioAttemptActPlaceNote = { location?: string; url?: string; actedOn?: string };

/** One act as the record keeps it. */
export type AutomationStudioAttemptActEntry = AutomationStudioAttemptAct & {
  /** A press with an effect that declared nothing: shown to the model and the judge, left out of a result's acts and of refusals (D6's disclosed limit). */
  undeclared?: true;
  stage: AutomationStudioAttemptActStage;
  /** The names its action answers to. */
  actions: string[];
  /** Digests of the action and target it answers to, under each form it was seen in. */
  keys: string[];
  /** Digests of the handle form alone, kept apart because a handle names one control whichever row a call carries. */
  handleKeys: string[];
  /** Every row it may be on. More than one only where a sentence could not tell them apart. */
  rows: string[];
  /** Digests of its control's words, which tell two acts on one row apart. */
  controls?: string[];
  /** A Flow step it is known by (`step:` or `node:`), where a source named only that. */
  steps?: string[];
  /** Whether an observation ran since it may have landed. */
  lookedSince: boolean;
  /** How many landings of this act the person's request asks for, where it asks for more than one (`../asked-count/`). Read at its first landing and kept. */
  asked?: number;
  /** How many of those the answers say happened. Present with `asked`. */
  landings?: number;
  at: number;
  /** Hashed words of the sentence naming its item, for a read that comes after it. */
  actedOnWords?: string[];
  /** A hashed path of the page it was made on, for a read that comes after it. */
  placePath?: string;
};

/** One row a read returned, hashed. */
export type AutomationStudioAttemptActNotedRow = {
  row: string;
  /** Handles printed in the row. */
  handles: string[];
  /** Per text field, its hashed words and those with a letter in them. */
  fields: Array<{ words: string[]; lettered: string[] }>;
  /** Hashed paths of the addresses in the row. */
  paths: string[];
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
