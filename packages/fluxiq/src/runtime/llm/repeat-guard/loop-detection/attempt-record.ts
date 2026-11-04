// What one attempt has already tried, so the same fix is known after a fresh
// context (`docs/working/answer-first-plan.md`, D14 and the loop's stages).
//
// **The interface the plan fixes.** The attempt's owner creates one record, hands
// it to every loop of the attempt as `attemptRecord`
// (`../../loop-configuration.ts`), and may persist `data()` with the attempt row
// and pass it back as `seed` on a later attempt. The loop writes to it as it
// goes, so what it holds survives a loop that ends any way at all.
//
// Content-free by construction: digests, Core's tool ids, closed codes, and for
// an amendment its step number and change kind, which a fresh context can be
// told. Never a row, a page's text, a typed value or a word the model wrote.

import type { AutomationStudioLlmLoopPattern } from "./types.ts";

/** How a thing that was tried came out when it was last tried. */
export type AutomationStudioLlmLoopTriedOutcome = "failed" | "changed_nothing" | "applied" | "undone";

/** One thing the attempt tried. */
export type AutomationStudioLlmLoopTriedEntry = {
  /** `call`: a call that brought nothing. `fix`: an edit of the draft or a submission of a Flow. */
  kind: "call" | "fix";
  /** The digest it is known by (`./meaningful-input.ts`), the same across loops and fresh contexts. */
  key: string;
  toolId: string;
  outcome: AutomationStudioLlmLoopTriedOutcome;
  times: number;
  /** The loop it was caught in, if it was. */
  pattern?: AutomationStudioLlmLoopPattern;
  /** For an amendment: the steps it named and how it changed them, as the model can be told them. */
  changes?: ReadonlyArray<{ step: number; change: string }>;
};

/** The record as data, for the attempt row and the next attempt. */
export type AutomationStudioLlmLoopAttemptRecordData = {
  version: 1;
  tried: readonly AutomationStudioLlmLoopTriedEntry[];
  /** Fresh approaches signalled so far (`./watch.ts`). */
  approaches: number;
};

export type AutomationStudioLlmLoopAttemptRecord = {
  /** What is known of this key, from this attempt's loops and its seed. */
  known(key: string): AutomationStudioLlmLoopTriedEntry | undefined;
  /** It was tried once more. */
  tried(entry: Omit<AutomationStudioLlmLoopTriedEntry, "times">): AutomationStudioLlmLoopTriedEntry;
  /** It was tried and has since been found not to work. */
  failed(key: string): void;
  /** It was caught in a loop. */
  caught(key: string, pattern: AutomationStudioLlmLoopPattern): void;
  /** A fresh approach was signalled; answers how many have been. */
  approachChanged(): number;
  readonly approaches: number;
  data(): AutomationStudioLlmLoopAttemptRecordData;
};

export function automationStudioLlmLoopAttemptRecord(seed?: AutomationStudioLlmLoopAttemptRecordData): AutomationStudioLlmLoopAttemptRecord {
  const entries = new Map<string, AutomationStudioLlmLoopTriedEntry>((seed?.tried ?? []).map((entry) => [entry.key, { ...entry }]));
  let approaches = seed?.approaches ?? 0;
  return {
    known: (key) => entries.get(key),
    tried(entry) {
      const next: AutomationStudioLlmLoopTriedEntry = { ...entries.get(entry.key), ...entry, times: (entries.get(entry.key)?.times ?? 0) + 1 };
      entries.set(entry.key, next);
      return next;
    },
    failed(key) {
      const entry = entries.get(key);
      if (entry) entries.set(key, { ...entry, outcome: "failed" });
    },
    caught(key, pattern) {
      const entry = entries.get(key);
      if (entry) entries.set(key, { ...entry, pattern });
    },
    approachChanged: () => (approaches += 1),
    get approaches() { return approaches; },
    data: () => ({ version: 1, tried: [...entries.values()].map((entry) => ({ ...entry })), approaches })
  };
}
