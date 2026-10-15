// Whether a trial's start took back an act the build explored on, that no step
// of the Flow does (t647; A8 bigbox debug `run-mv9zn5ob-d929084d`, section 4,
// fix 6).
//
// A builder pressed a control while exploring that changed what the site
// offers (a lasting act), then explored and built on the page that act left.
// Before each trial the deployment's start hook put the site back, taking that
// act back with it (`absorbedByStartReset`, `./ledger.ts`, t504), and no step
// of its subflow, nor of a subflow run before it, does that act. So every
// trial met a page the builder never explored, failed, and nothing told the
// builder why: the trial's evidence listed the act as taken back, and said no
// more.
//
// This is measured, never guessed. An act counts only when the act log says
// it was made by an exploration call (`call`), by the brief asked about where
// one is named (`owner`), on a named control (`control`); and when no step of
// the Flow -- this proposal's steps, and every act the trial itself landed,
// the predecessors' among them -- names that control in its own words. A step
// that names it, whatever it does with it, counts as doing it, so a finding is
// never said of an act a step may perform. Which act mattered to the verdict is
// not said: only that the page explored was changed by an act the start took
// back and no step does.
//
// Words are generic: the act is named as the act log records it (its id, what
// it did, the call that made it), and nothing names a site, page or task.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetAbsorbedAct } from "./contracts.ts";

/** The finding's code, first in each finding. */
const CODE = "trial.explored_on_absorbed_act";
/** More findings than this in one trial say nothing more. */
const MAX_FINDINGS = 10;
/** The fields a step's own parameters keep a control's words in (`../../llm/model-facing/control-words.ts`), and a flat target's name. */
const WORD_FIELDS = ["accessibleName", "visibleText", "label", "placeholder"] as const;
const FLAT_FIELDS = [...WORD_FIELDS, "name"] as const;

/**
 * The `trial.explored_on_absorbed_act` findings of one trial (header): each
 * act this trial's start reset absorbed that was made while exploring -- by
 * `owner`'s brief, where one is given -- on a named control that no step in
 * `steps` and no act in `ran` names. `whose` says what the steps are: one
 * subflow and those run before it, or a whole Flow.
 */
export function automationStudioSiteResetExploredOnAbsorbed(input: {
  absorbed: readonly AutomationStudioSiteResetAbsorbedAct[] | undefined;
  owner?: string | undefined;
  steps: ReadonlyArray<{ label?: string | undefined; parameters?: JsonObject | undefined }>;
  ran?: ReadonlyArray<{ label?: string | undefined; control?: string | undefined }> | undefined;
  whose: "subflow" | "flow";
}): JsonObject[] {
  const explored = (input.absorbed ?? []).filter((act) => act.call !== undefined && words(act.control) !== "" && (input.owner === undefined || act.owner === input.owner));
  if (!explored.length) return [];
  const named = [
    ...input.steps.flatMap((step) => [step.label, ...stepWords(step.parameters)]),
    ...(input.ran ?? []).flatMap((act) => [act.label, act.control])
  ].map(words).filter((said) => said !== "");
  return explored
    .filter((act) => !named.some((said) => samePhrase(said, words(act.control))))
    .slice(0, MAX_FINDINGS)
    .map((act) => ({ code: CODE, act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}), said: said(act, input.whose) }));
}

/** What the finding says (header). Generic words. */
function said(act: AutomationStudioSiteResetAbsorbedAct, whose: "subflow" | "flow"): string {
  const made = whose === "subflow" ? "while this brief explored" : "while this build explored";
  const steps = whose === "subflow" ? "no step of this subflow, nor of a subflow run before it," : "no step of this Flow";
  return `${act.act} (${act.did}${act.call ? `, call ${act.call}` : ""}) was made ${made}, and the start reset took it back before this trial; ${steps} does it. `
    + `So the page explored after it was changed by an act this trial's start undid and no step does, and the trial did not meet that page.`;
}

/** Every word-bearing field of a step's control, from its resolved `element`, its `target`'s fingerprint, or a flat `target`. */
function stepWords(parameters: JsonObject | undefined): string[] {
  const element = record(parameters?.element);
  const target = record(parameters?.target);
  const fingerprint = record(target?.fingerprint);
  const flat = target && !fingerprint ? target : undefined;
  const read = (identity: JsonObject | undefined, fields: readonly string[]) => (identity ? fields.map((field) => identity[field]).filter((value): value is string => typeof value === "string") : []);
  return [...read(element, WORD_FIELDS), ...read(fingerprint, WORD_FIELDS), ...read(flat, FLAT_FIELDS)];
}

/** Words compared as a person reads them: case, spacing and surrounding quotes aside. */
function words(value: string | undefined): string {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim().toLocaleLowerCase() : "";
}

/** One names the other: equal, or either holds the other as a whole phrase. */
function samePhrase(a: string, b: string): boolean {
  return a === b || holds(a, b) || holds(b, a);
}

function holds(text: string, phrase: string): boolean {
  let at = text.indexOf(phrase);
  while (at >= 0) {
    const before = text[at - 1], after = text[at + phrase.length];
    if (!wordChar(before) && !wordChar(after)) return true;
    at = text.indexOf(phrase, at + 1);
  }
  return false;
}

function wordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
