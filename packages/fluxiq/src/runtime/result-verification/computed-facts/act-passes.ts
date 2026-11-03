// Each pass of a repeat ran the step carrying the part's requested act
// (framework plan P5, K4).
//
// **What Core reads.** A build trial's `siteChange` (t775) proves each task
// part with a typed effect from what Core read of the site before and after.
// Its producer (t796) adds, per part, `notRun`: each step serving the part
// that did not run on some pass of the trial -- its node, its label, the
// passes, and why: a guard routed past it (`after` the step it runs only
// after), or the run ended before reaching it -- and the proof `not_run` where
// no serving step ran on any pass. `notRun` may sit on a `shown` part whose act
// missed only some passes. A part with a typed effect and any such entry, or
// the proof `not_run`, is a computed fail:
// what the part asks was not done on those passes, whatever the end state
// shows, so it is a Core no with an `act_missing` defect naming the step, the
// passes and the reason, and no judge is asked. A part whose `notRun` is
// present and empty ran every serving step on every pass: that holds, and is
// said to the judge as settled, never as a yes.
//
// **Read structurally until t796 merges.** This branch's proof type does not
// carry `not_run` or `notRun` yet, so both are read here and nowhere else, in
// t796's shape. Absent, this computes no fact, and the judge is asked as before
// (the K4 default). A list holding any entry not of that shape is not read; a
// `not_run` proof is a fail with or without one.

import type { AutomationStudioResultComputedDefect, AutomationStudioResultComputedFact, AutomationStudioResultComputedFactsInput } from "../contracts/index.ts";

/** One step serving a part that did not run on some pass of the trial, as t796 shapes it (header). */
type StepNotRun = { nodeId: string; label?: string; reason: "guarded" | "unreached"; after?: string; passes: number[] | "every"; of?: number };

type Proof = NonNullable<AutomationStudioResultComputedFactsInput["summary"]["siteChange"]>["proofs"][number];

/** Each pass of a repeat ran the step carrying the part's requested act. None where Core cannot compute it. */
export function automationStudioResultActPassesFact(input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  const facts: AutomationStudioResultComputedFact[] = [];
  for (const proof of input.summary.siteChange?.proofs ?? []) {
    if (!proof.effect) continue;
    const notRun = notRunOf(proof);
    if ((proof.proof as string) === "not_run" && !notRun?.length) {
      const words = `no step serving part "${proof.part}" (${effectWords(proof.effect)}) ran on any pass of this trial`;
      facts.push({ kind: "act_passes", status: "fails", said: `Core read that ${words}.`, defects: [{ kind: "act_missing", row: `part "${proof.part}"`, requestWords: partWords(proof, input) }] });
      continue;
    }
    if (notRun === undefined) continue;
    if (!notRun.length) {
      facts.push({ kind: "act_passes", status: "holds", said: `Core read that every step serving part "${proof.part}" (${effectWords(proof.effect)}) ran on every pass of this trial.` });
      continue;
    }
    const requestWords = partWords(proof, input);
    const defects: AutomationStudioResultComputedDefect[] = notRun.map((entry) => ({ kind: "act_missing", row: stepNotRunWords(entry), step: entry.label ?? entry.nodeId, requestWords }));
    facts.push({
      kind: "act_passes",
      status: "fails",
      said: `Core read that part "${proof.part}" (${effectWords(proof.effect)}) was not done on every pass of this trial: ${notRun.map(stepNotRunWords).join("; ")}.`,
      defects
    });
  }
  return facts;
}

/** A proof's `notRun` where it carries one of the proposed shape (header): `undefined` where it carries none, so no fact is computed. */
function notRunOf(proof: Proof): StepNotRun[] | undefined {
  const raw = (proof as Proof & { notRun?: unknown }).notRun;
  if (!Array.isArray(raw)) return undefined;
  const entries = raw.filter(isStepNotRun);
  return entries.length === raw.length ? entries : undefined;
}

function isStepNotRun(value: unknown): value is StepNotRun {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  const passes = entry.passes === "every" || (Array.isArray(entry.passes) && entry.passes.length > 0 && entry.passes.every((pass) => Number.isInteger(pass) && (pass as number) > 0));
  return typeof entry.nodeId === "string" && entry.nodeId.length > 0 && passes && (entry.reason === "guarded" || entry.reason === "unreached")
    && (entry.label === undefined || typeof entry.label === "string") && (entry.after === undefined || typeof entry.after === "string")
    && (entry.of === undefined || Number.isInteger(entry.of));
}

/** One step that did not run, in Core's words: the step, the passes, and why. */
function stepNotRunWords(entry: StepNotRun): string {
  const step = entry.label ? `the step "${entry.label}"` : `the step ${entry.nodeId}`;
  return `${step} did not run on ${passesWords(entry)}: ${whyWords(entry)}`;
}

/** The passes a step did not run on, in Core's words. */
function passesWords(entry: StepNotRun): string {
  if (entry.passes === "every") return entry.of !== undefined ? `any of its ${entry.of} passes` : "any pass";
  const listed = entry.passes.length === 1 ? `pass ${entry.passes[0]}` : `passes ${entry.passes.slice(0, -1).join(", ")} and ${entry.passes.at(-1)}`;
  return entry.of !== undefined ? `${listed} of ${entry.of}` : listed;
}

/** Why a step did not run, in Core's words. */
function whyWords(entry: StepNotRun): string {
  if (entry.reason === "unreached") return "the run ended or failed before reaching it";
  return entry.after ? `a guard routed past it, as it runs only after "${entry.after}"` : "a guard routed past it";
}

/** A part's typed effect, in Core's words. */
function effectWords(effect: Proof["effect"]): string {
  if (effect.kind === "end_state") return `the end state ${effect.state}`;
  return `${effect.direction} ${effect.count === "each_match" ? "each match of" : effect.count} ${effect.what}`;
}

/**
 * The request's words the part falls under: the part's own words on the task
 * checklist, in the instructions' words; else the request's text, which the
 * part is one clause of, within a defect's bound.
 */
function partWords(proof: Proof, input: AutomationStudioResultComputedFactsInput): string {
  const asked = input.summary.taskChecklist?.asked.find((part) => part.part === proof.part)?.words.trim();
  if (asked) return asked;
  const text = input.requestText.trim();
  if (!text) return `part "${proof.part}"`;
  return text.length <= 500 ? text : `${text.slice(0, 499)}…`;
}
