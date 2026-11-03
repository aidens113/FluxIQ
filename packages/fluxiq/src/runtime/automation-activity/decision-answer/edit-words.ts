// What an edit to the draft changed, in plain words, from what Core applied.
//
// Live run `run-muw60unq-591e23bd` (run A, U2): an edit that dropped the Add to
// cart step read "Edit the Flow · Done", so a person watching could not see the
// build drop the press the request was for. The card now says the change:
// 'removed "Add to cart"'.
//
// **What it is written from.** The decision's own amendments, less the ones
// the loop's answer refused (`./draft-edit.ts`), each read against the draft
// the model was shown when it decided -- the draft's entry numbers the steps
// the amendments name (`../../flow-draft/entry.ts`) and says what each does
// (`does.target`, the domain's words for the control). Never the model's
// summary, which said "adding the Add to cart press" of an edit that took it
// out.
//
// **What it says.** A change to what the Flow does: a step added to it or
// put back, removed from it, moved, made optional or conditional, repeated or
// no longer repeated, or given a value that varies. A step asked to run again
// says nothing here, since its own rows say how it went, and neither does an
// amendment that only restated what the draft shows (a `keep` of a step in the
// Flow, an `add` of one already there).

import { automationStudioActivityAction, automationStudioActivityHumanLabel } from "../wording/index.ts";

type Evidence = ReadonlyArray<{ callId: string; toolId: string; value: unknown }>;

/** One amendment as the decision carries it (`../../flow-draft/amendment/types.ts`), read by shape. */
type Amendment = { step: number; change: string; to?: number; check?: number; through?: number; over?: number; while?: number; most?: number };

/** The draft's entry, read as a plain string so this module does not reach into the draft. */
const DRAFT_ENTRY = "core.flow_draft";
/** The refusal reasons that refuse only a step asked to run again. */
const RERUN_REASONS: ReadonlySet<string> = new Set(["changes_nothing", "rerun_holds_binding"]);
/** The most changes one card names before it counts the rest. */
const MAX_NAMED = 3;
/** The most of a step's name a change shows. */
const MAX_NAME = 40;

const record = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);
const position = (value: unknown): number | undefined => (typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : undefined);

function amendmentsOf(value: unknown): Amendment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Amendment[] => {
    const entry = record(item);
    const step = position(entry?.step);
    if (!entry || step === undefined || typeof entry.change !== "string") return [];
    const at = (key: string): { [key: string]: number } => { const found = position(entry[key]); return found === undefined ? {} : { [key]: found }; };
    return [{ step, change: entry.change, ...at("to"), ...at("check"), ...at("through"), ...at("over"), ...at("while"), ...at("most") }];
  });
}

/** The draft's step lines the model was shown, by number. */
function shownSteps(evidence: Evidence): Map<number, Record<string, unknown>> {
  const entry = evidence.find((candidate) => candidate.callId === DRAFT_ENTRY && candidate.toolId === DRAFT_ENTRY);
  const steps = record(entry?.value)?.steps;
  const lines = new Map<number, Record<string, unknown>>();
  for (const line of Array.isArray(steps) ? steps : []) {
    const step = record(line);
    const at = position(step?.step);
    if (step && at !== undefined) lines.set(at, step);
  }
  return lines;
}

/**
 * A step's name: the domain's words for the control it acts on, else the
 * words its result named it by, else what it does in Core's own words.
 */
function nameOf(line: Record<string, unknown> | undefined): string | undefined {
  if (!line) return undefined;
  const target = record(line.does)?.target;
  const control = line.control;
  for (const words of [target, control]) {
    const said = typeof words === "string" && /[\p{L}\p{N}]/u.test(words) ? automationStudioActivityHumanLabel(words, MAX_NAME) : undefined;
    if (said) return said;
  }
  const input = record(line.input);
  const action = automationStudioActivityAction({ id: typeof line.actionId === "string" ? line.actionId : undefined, parameters: input?.parameters });
  return action ? `${action.charAt(0).toLowerCase()}${action.slice(1)}` : undefined;
}

/**
 * A step as a person reads it: its name where it has one ("Add to cart"),
 * else its number ("step 9"). The draft's numbers are no part of what the
 * person sees, so a card names a step by number only when it has nothing else
 * (U-3, `run-muw60j7c-bb7c9a62`: "steps 1, 2, 3, 4 and 5" in the chat).
 */
function called(at: number, lines: Map<number, Record<string, unknown>>): string {
  const name = nameOf(lines.get(at));
  return name ? `"${name}"` : `step ${at}`;
}

function sentence(amendment: Amendment, lines: Map<number, Record<string, unknown>>): string | undefined {
  const line = lines.get(amendment.step);
  const step = called(amendment.step, lines);
  const inFlow = line?.inResult !== false;
  switch (amendment.change) {
    case "add":
    case "keep":
      return inFlow ? undefined : `added ${step}`;
    case "drop":
    case "exploratory":
      return inFlow ? `removed ${step}` : undefined;
    case "reorder":
      return amendment.to !== undefined ? `moved ${step} to step ${amendment.to}` : `moved ${step}`;
    case "optional":
      return `made ${step} optional`;
    case "only_if":
      return `made ${step} run only when ${called(amendment.check ?? amendment.step - 1, lines)} works`;
    case "on_failed":
      return amendment.to !== undefined ? `made ${called(amendment.to, lines)} run when ${step} fails` : undefined;
    case "repeat": {
      // A do-while (`while`, never `over`): the span runs again while its last
      // step works, so it repeats over no step before it (read-list S3).
      if (amendment.while !== undefined && amendment.over === undefined) return whileSentence(amendment, step, lines);
      const over = called(amendment.over ?? amendment.step - 1, lines);
      return amendment.through !== undefined && amendment.through !== amendment.step
        ? `made ${step} through ${called(amendment.through, lines)} repeat over ${over}`
        : `made ${step} repeat over ${over}`;
    }
    case "unrepeat":
      return `stopped ${step} repeating`;
    case "bind":
      return `made a value in ${step} vary`;
    default:
      return undefined;
  }
}

/**
 * A do-while amendment in words: the span from its first step through the
 * `while` step repeats while that step works ('made "Read" through "Next"
 * repeat while "Next" works'), with its bound when the amendment set one.
 */
function whileSentence(amendment: Amendment, step: string, lines: Map<number, Record<string, unknown>>): string {
  const last = amendment.while!;
  const bound = amendment.most !== undefined ? `, at most ${amendment.most} ${amendment.most === 1 ? "time" : "times"}` : "";
  if (last === amendment.step) return `made ${step} repeat while it works${bound}`;
  const through = called(last, lines);
  return `made ${step} through ${through} repeat while ${through} works${bound}`;
}

/**
 * What an edit changed: `words`, its plain account (see the header), absent
 * when nothing it changed has words; and `rerun`, true when it asked for a
 * step to run again, whose own rows say how that went. `refused` is the loop's
 * refusal of the edit, by step and reason, for an edit only partly applied; an
 * amendment is refused when an entry names its step and refuses its kind (a
 * step asked to run again, or any other change).
 */
export function automationStudioActivityDraftEditWords(input: { amendments: unknown; shown: Evidence; refused?: ReadonlyArray<{ step: number; reason: string }> | undefined }): { words?: string; rerun: boolean } {
  const lines = shownSteps(input.shown);
  const refused = input.refused ?? [];
  const all = amendmentsOf(input.amendments);
  const applied = all.filter((amendment) => !refused.some((entry) => entry.step === amendment.step && RERUN_REASONS.has(entry.reason) === (amendment.change === "rerun")));
  const rerun = applied.some((amendment) => amendment.change === "rerun");
  const said = [...new Set(applied.map((amendment) => sentence(amendment, lines)).filter((words): words is string => words !== undefined))];
  if (!said.length) return { rerun };
  const named = said.slice(0, MAX_NAMED);
  const more = said.length - named.length;
  return { words: more > 0 ? `${named.join("; ")}; and ${more} more ${more === 1 ? "change" : "changes"}` : named.join("; "), rerun };
}
