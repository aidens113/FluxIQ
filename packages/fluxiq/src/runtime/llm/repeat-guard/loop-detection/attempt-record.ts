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
//
// **It owns the attempt's model ladder** (`../../role-routing/ladder/`, t962): one record per
// attempt is what makes a climb sticky for the attempt and a new attempt start on its base rung.
// A seed brings the ladder back only where it carries one: a carried-on attempt is the same
// attempt.

import { automationStudioLlmModelLadder, type AutomationStudioLlmModelLadder, type AutomationStudioLlmModelLadderData } from "../../role-routing/ladder/index.ts";
import type { AutomationStudioLlmLoopDecisionKind } from "../../loop-decision/index.ts";
import type { AutomationStudioLlmLoopFinding, AutomationStudioLlmLoopPattern } from "./types.ts";

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

/** Historical decisions, including retired escalation, remain readable. One decision the model made about a caught repeat (`../../decision-handlers/loop-decision.ts`): its kind and the repeat it was about, codes only. */
export type AutomationStudioLlmLoopDecided = { decision: AutomationStudioLlmLoopDecisionKind | "escalate_model"; pattern?: AutomationStudioLlmLoopPattern; repeats?: number };

/** What the last loop stopped repeated: the finding a fresh round is steered off (`./watch.ts`). */
export type AutomationStudioLlmLoopStoppedOn = Pick<AutomationStudioLlmLoopFinding, "pattern" | "repeats" | "toolIds">;

/** The record as data, for the attempt row and the next attempt. */
export type AutomationStudioLlmLoopAttemptRecordData = {
  version: 1;
  tried: readonly AutomationStudioLlmLoopTriedEntry[];
  /** Fresh approaches signalled so far (`./watch.ts`). */
  approaches: number;
  /** The models the attempt climbed, and why, once its provider is on the ladder. */
  ladder?: AutomationStudioLlmModelLadderData;
  /** The model's decisions about caught repeats, oldest first. */
  decisions?: readonly AutomationStudioLlmLoopDecided[];
  /** What the latest stopped loop repeated, for the round after it; not kept on the attempt's row. */
  stoppedOn?: AutomationStudioLlmLoopStoppedOn;
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
  /** The model decided how to go on about a caught repeat. */
  decided(decision: AutomationStudioLlmLoopDecided): void;
  /** A loop was stopped on this finding: the next fresh round is told what it repeated. */
  stopped(finding: AutomationStudioLlmLoopStoppedOn): void;
  /** A repeat was caught and the model told of it, by the watch or by a completion refused again: what a decision about it is about. */
  noted(finding: AutomationStudioLlmLoopFinding): void;
  /** The repeat caught last, in this attempt; not kept on its row. */
  readonly lastNoted: AutomationStudioLlmLoopFinding | undefined;
  /**
   * A repeat was caught (`noted`) after the latest change of approach, the model's `change_approach` or a fresh
   * approach (`approachChanged`): the loop persists. What `ask_person` waits for (`../../loop-decision/options.ts`).
   * Not kept on the row: a carried-on attempt has to be caught again before it may ask.
   */
  readonly persisting: boolean;
  /** The attempt's model ladder. */
  readonly ladder: AutomationStudioLlmModelLadder;
  data(): AutomationStudioLlmLoopAttemptRecordData;
};

/** A record, from `seed` where the attempt carries one; `options.ladder` shares a ladder already climbing (a loop run inside another). */
export function automationStudioLlmLoopAttemptRecord(seed?: AutomationStudioLlmLoopAttemptRecordData, options?: { ladder?: AutomationStudioLlmModelLadder | undefined }): AutomationStudioLlmLoopAttemptRecord {
  const entries = new Map<string, AutomationStudioLlmLoopTriedEntry>((seed?.tried ?? []).map((entry) => [entry.key, { ...entry }]));
  let approaches = seed?.approaches ?? 0;
  let stoppedOn: AutomationStudioLlmLoopStoppedOn | undefined;
  let lastNoted: AutomationStudioLlmLoopFinding | undefined;
  let persisting = false;
  const decisions: AutomationStudioLlmLoopDecided[] = (seed?.decisions ?? []).map((decided) => ({ ...decided }));
  const ladder = options?.ladder ?? automationStudioLlmModelLadder(seed?.ladder);
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
    approachChanged: () => {
      persisting = false;
      return (approaches += 1);
    },
    get approaches() { return approaches; },
    noted(finding) {
      lastNoted = { ...finding, toolIds: [...finding.toolIds], unchanged: [...finding.unchanged] };
      persisting = true;
    },
    get lastNoted() { return lastNoted; },
    get persisting() { return persisting; },
    decided(decided) {
      decisions.push({ ...decided });
      if (decided.decision === "change_approach") persisting = false;
    },
    stopped(finding) {
      stoppedOn = { pattern: finding.pattern, repeats: finding.repeats, toolIds: [...finding.toolIds] };
    },
    ladder,
    data: () => {
      const climbed = ladder.data();
      return { version: 1, tried: [...entries.values()].map((entry) => ({ ...entry })), approaches, ...(climbed ? { ladder: climbed } : {}), ...(decisions.length ? { decisions: decisions.map((decided) => ({ ...decided })) } : {}), ...(stoppedOn ? { stoppedOn: { ...stoppedOn, toolIds: [...stoppedOn.toolIds] } } : {}) };
    }
  };
}
