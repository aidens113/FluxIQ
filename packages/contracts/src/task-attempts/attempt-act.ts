// One lasting act of an attempt: the merged act record (plan, D6). It stands in
// for the four records that hold acts today, and it is carried across every stage
// of an attempt so a retry never repeats an act. Carrying it is the Exploration
// lane's work; this is its shape.
//
// `what`, `where` and `undo.how` are a person's words, from Core's record and never
// the model's prose. `rowIdentity` is a digest. Nothing here may carry a page
// address, page text or a token (`./person-words.ts` says how far that is checked).

import { hasOnlyKeys, isDigest, isId, isMemberOf, isPlainRecord } from "./field-checks.ts";
import { parseTotally } from "./parse-totally.ts";
import { isPersonWords } from "./person-words.ts";

/**
 * Core's lasting consequence classes, in its display order: the values of
 * `AUTOMATION_STUDIO_ACTION_CONSEQUENCES`, which a contract cannot import because
 * it lives in the runtime. `tests/attempt-act.test.ts` fails if the two part.
 */
export const AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES = Object.freeze(["move_money", "delete", "send_or_publish", "modify_existing", "create_new"] as const);

export type AutomationStudioAttemptActClass = (typeof AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES)[number];

/**
 * - `landed`: it happened.
 * - `may_have_landed`: it ran and its effect is uncertain. A retry looks at the
 *   page to settle it and never repeats it blind.
 * - `undone`: it happened and was reversed through the site's own controls.
 * - `not_done`: it was written or asked for and never happened, such as a
 *   permission the person declined.
 */
export const AUTOMATION_STUDIO_ATTEMPT_ACT_STATES = Object.freeze(["landed", "may_have_landed", "undone", "not_done"] as const);

export type AutomationStudioAttemptActState = (typeof AUTOMATION_STUDIO_ATTEMPT_ACT_STATES)[number];

export type AutomationStudioAttemptAct = {
  /** The act's id across build, trial and run, so one act is one entry in every stage. */
  id: string;
  /** What it did, in a person's words. */
  what: string;
  /** Where it did it, as a site and page in words. */
  where: string;
  /**
   * The classes declared for it, in Core's display order. Empty for an act whose
   * class was never declared: that it happened is still true, and it says no class.
   */
  classes: AutomationStudioAttemptActClass[];
  state: AutomationStudioAttemptActState;
  /** A digest of the row it acted on, when it acted per row, by the row's own fields and never its position or a handle. The row's values are never here. */
  rowIdentity?: string;
  /** How it can be taken back, when the site offers a way, in a person's words. */
  undo?: { how: string };
};

export type AutomationStudioAttemptActParseResult =
  | { ok: true; act: AutomationStudioAttemptAct }
  | { ok: false; issues: string[] };

const ACT_KEYS: ReadonlySet<string> = new Set(["id", "what", "where", "classes", "state", "rowIdentity", "undo"]);
const UNDO_KEYS: ReadonlySet<string> = new Set(["how"]);

/**
 * Parses an untrusted value into an act, returning fresh objects. Exact fields:
 * an unknown key, class or state is refused, and repeated classes come back once
 * each in Core's display order. Issues are stable codes prefixed `attempt_act.`,
 * each listed once.
 */
export function parseAutomationStudioAttemptAct(value: unknown): AutomationStudioAttemptActParseResult {
  const parsed = parseTotally("attempt_act", (issues) => readAct(value, issues));
  return parsed.ok ? { ok: true, act: parsed.value } : parsed;
}

/** The classes in Core's display order, each once; null when `value` is not a list of known classes. */
export function readAttemptActClasses(value: unknown): AutomationStudioAttemptActClass[] | null {
  if (!Array.isArray(value) || value.length > AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.length * 2) return null;
  if (!value.every((item) => isMemberOf(AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES, item))) return null;
  return AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.filter((known) => (value as unknown[]).includes(known));
}

function readAct(value: unknown, issues: Set<string>): AutomationStudioAttemptAct | null {
  if (!isPlainRecord(value)) {
    issues.add("attempt_act.not_object");
    return null;
  }
  if (!hasOnlyKeys(value, ACT_KEYS)) issues.add("attempt_act.unknown_key");
  const { id, what, where, state, rowIdentity, undo } = value;
  const classes = readAttemptActClasses(value.classes);
  if (!isId(id)) issues.add("attempt_act.invalid_id");
  if (!isPersonWords(what)) issues.add("attempt_act.invalid_what");
  if (!isPersonWords(where)) issues.add("attempt_act.invalid_where");
  if (classes === null) issues.add("attempt_act.invalid_classes");
  if (!isMemberOf(AUTOMATION_STUDIO_ATTEMPT_ACT_STATES, state)) issues.add("attempt_act.invalid_state");
  if (rowIdentity !== undefined && !isDigest(rowIdentity)) issues.add("attempt_act.invalid_row_identity");
  const how = readUndo(undo, issues);
  if (issues.size > 0 || !isId(id) || !isPersonWords(what) || !isPersonWords(where) || classes === null || !isMemberOf(AUTOMATION_STUDIO_ATTEMPT_ACT_STATES, state)) return null;
  const act: AutomationStudioAttemptAct = { id, what, where, classes, state };
  if (typeof rowIdentity === "string") act.rowIdentity = rowIdentity;
  if (how !== undefined) act.undo = { how };
  return act;
}

function readUndo(undo: unknown, issues: Set<string>): string | undefined {
  if (undo === undefined) return undefined;
  if (!isPlainRecord(undo) || !hasOnlyKeys(undo, UNDO_KEYS) || !isPersonWords(undo.how)) {
    issues.add("attempt_act.invalid_undo");
    return undefined;
  }
  return undo.how;
}
