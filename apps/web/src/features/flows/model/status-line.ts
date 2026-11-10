import { agoText } from "../../home/model";
import type { RunSummary } from "../wire";
import type { StatusLine, Tone } from "./types";

const ENDINGS: Record<string, { words: string; tone: Tone }> = {
  succeeded: { words: "passed", tone: "ok" },
  failed: { words: "failed", tone: "bad" },
  cancelled: { words: "was stopped", tone: "neutral" },
  interrupted: { words: "was interrupted", tone: "warn" },
  waiting: { words: "is waiting for you", tone: "warn" }
};

export type StatusFacts = {
  /** The Flow's latest run, when it has one. Every run a person starts here runs the whole Flow. */
  lastRun?: RunSummary;
  /** The version the list shows. */
  revision: number;
  /** When that version was saved, when known. */
  savedAt?: number;
  now: number;
};

/**
 * "Last whole run passed 2 min ago · $0.00 · version 14", or "Changed, not yet run whole ·
 * version 15" once the Flow was saved after its last run began: under the standing rule a Flow
 * is only known to work when a whole run of it as it stands has passed.
 */
export function statusLine(facts: StatusFacts): StatusLine {
  const version = `version ${facts.revision}`;
  const run = facts.lastRun;
  if (!run) return { tone: "neutral", text: `Not run yet · ${version}` };
  if (run.status === "running" || run.status === "queued") return { tone: "neutral", text: `Running now · ${version}` };
  if (facts.savedAt !== undefined && facts.savedAt > run.startedAt) return { tone: "warn", text: `Changed, not yet run whole · ${version}` };
  const ending = ENDINGS[run.status] ?? { words: "ended", tone: "neutral" };
  const parts = [`Last whole run ${ending.words} ${agoText(run.startedAt, facts.now)}`];
  if (run.costUsd !== undefined) parts.push(costWords(run.costUsd));
  parts.push(version);
  return { tone: ending.tone, text: parts.join(" · ") };
}

function costWords(usd: number): string {
  if (usd > 0 && usd < 0.01) return "under $0.01";
  return `$${usd.toFixed(2)}`;
}
