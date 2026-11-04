// What one attempt has already tried, carried across fresh contexts and to a later
// attempt so the same fix cannot simply come back (plan, D14).
//
// **Aligned with the Loop Detection lane.** This is the wire form of
// `AutomationStudioLlmLoopAttemptRecordData` in
// `runtime/llm/repeat-guard/loop-detection/attempt-record.ts`: same members, same
// words, `readonly` as there, so that lane's `data()` is assignable to it. A
// contract cannot import the runtime, so the runtime side should state the
// assignment when it merges.
//
// Content-free by construction: digests, Core's tool ids, closed codes, and for an
// amendment its step number and change kind. Never a row, page text, a typed value,
// a word the model wrote, a page address or a token. `failed` on an entry says how
// one try came out. It is not a status a task can end in (`./task-attempt.ts`).

import { hasOnlyKeys, isCode, isCount, isDigest, isMemberOf, isPlainRecord } from "./field-checks.ts";
import { parseTotally } from "./parse-totally.ts";
import { AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS } from "./limits.ts";
import { AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS, type AutomationStudioTaskAttemptLoopPattern } from "./loops-caught.ts";

/** `call`: a call that brought nothing. `fix`: an edit of the draft or a submission of a Flow. */
export const AUTOMATION_STUDIO_TRIED_KINDS = Object.freeze(["call", "fix"] as const);

export type AutomationStudioTriedKind = (typeof AUTOMATION_STUDIO_TRIED_KINDS)[number];

/** How a thing that was tried came out when it was last tried. */
export const AUTOMATION_STUDIO_TRIED_OUTCOMES = Object.freeze(["failed", "changed_nothing", "applied", "undone"] as const);

export type AutomationStudioTriedOutcome = (typeof AUTOMATION_STUDIO_TRIED_OUTCOMES)[number];

/** One thing the attempt tried. */
export type AutomationStudioTriedEntry = {
  kind: AutomationStudioTriedKind;
  /** The digest it is known by, the same across loops and fresh contexts. */
  key: string;
  toolId: string;
  outcome: AutomationStudioTriedOutcome;
  /** How many times, from 1. */
  times: number;
  /** The loop it was caught in, if it was. */
  pattern?: AutomationStudioTaskAttemptLoopPattern;
  /** For an amendment: the steps it named and how it changed them, as the model can be told them. */
  changes?: ReadonlyArray<{ step: number; change: string }>;
};

export type AutomationStudioTriedRecord = {
  version: 1;
  tried: readonly AutomationStudioTriedEntry[];
  /** Fresh approaches signalled so far. */
  approaches: number;
};

export type AutomationStudioTriedRecordParseResult =
  | { ok: true; record: AutomationStudioTriedRecord }
  | { ok: false; issues: string[] };

const RECORD_KEYS: ReadonlySet<string> = new Set(["version", "tried", "approaches"]);
const ENTRY_KEYS: ReadonlySet<string> = new Set(["kind", "key", "toolId", "outcome", "times", "pattern", "changes"]);
const CHANGE_KEYS: ReadonlySet<string> = new Set(["step", "change"]);

/**
 * Parses an untrusted value into a tried record, returning fresh objects. Exact
 * fields: an unknown key, version, kind, outcome or pattern is refused, as is a
 * `key` that is not a digest, so no text can travel as a key. Issues are stable
 * codes prefixed `tried_record.`, each listed once.
 */
export function parseAutomationStudioTriedRecord(value: unknown): AutomationStudioTriedRecordParseResult {
  const parsed = parseTotally("tried_record", (issues) => readRecord(value, issues));
  return parsed.ok ? { ok: true, record: parsed.value } : parsed;
}

function readRecord(value: unknown, issues: Set<string>): AutomationStudioTriedRecord | null {
  if (!isPlainRecord(value)) {
    issues.add("tried_record.not_object");
    return null;
  }
  if (!hasOnlyKeys(value, RECORD_KEYS)) issues.add("tried_record.unknown_key");
  const { version, tried, approaches } = value;
  if (version !== 1) issues.add("tried_record.invalid_version");
  if (!isCount(approaches)) issues.add("tried_record.invalid_approaches");
  if (!Array.isArray(tried) || tried.length > LIMITS.triedMaxEntries) issues.add("tried_record.invalid_tried");
  const entries = Array.isArray(tried) ? tried.map((item) => readEntry(item, issues)) : [];
  if (issues.size > 0 || !isCount(approaches)) return null;
  return { version: 1, tried: entries.filter((entry) => entry !== null), approaches };
}

function readEntry(value: unknown, issues: Set<string>): AutomationStudioTriedEntry | null {
  if (!isPlainRecord(value)) {
    issues.add("tried_record.invalid_entry");
    return null;
  }
  if (!hasOnlyKeys(value, ENTRY_KEYS)) issues.add("tried_record.unknown_key");
  const { kind, key, toolId, outcome, times, pattern } = value;
  const changes = value.changes === undefined ? undefined : readChanges(value.changes);
  if (!isMemberOf(AUTOMATION_STUDIO_TRIED_KINDS, kind)) issues.add("tried_record.invalid_kind");
  if (!isDigest(key)) issues.add("tried_record.invalid_key");
  if (!isCode(toolId)) issues.add("tried_record.invalid_tool_id");
  if (!isMemberOf(AUTOMATION_STUDIO_TRIED_OUTCOMES, outcome)) issues.add("tried_record.invalid_outcome");
  if (!isCount(times) || times < 1) issues.add("tried_record.invalid_times");
  if (pattern !== undefined && !isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS, pattern)) issues.add("tried_record.invalid_pattern");
  if (changes === null) issues.add("tried_record.invalid_changes");
  if (!isMemberOf(AUTOMATION_STUDIO_TRIED_KINDS, kind) || !isDigest(key) || !isCode(toolId) || !isMemberOf(AUTOMATION_STUDIO_TRIED_OUTCOMES, outcome) || !isCount(times) || changes === null) return null;
  const entry: AutomationStudioTriedEntry = { kind, key, toolId, outcome, times };
  if (isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS, pattern)) entry.pattern = pattern;
  if (changes !== undefined) entry.changes = changes;
  return entry;
}

function readChanges(value: unknown): Array<{ step: number; change: string }> | null {
  if (!Array.isArray(value) || value.length > LIMITS.listMaxEntries) return null;
  const changes: Array<{ step: number; change: string }> = [];
  for (const item of value) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, CHANGE_KEYS)) return null;
    const { step, change } = item;
    if (!isCount(step) || !isCode(change)) return null;
    changes.push({ step, change });
  }
  return changes;
}
