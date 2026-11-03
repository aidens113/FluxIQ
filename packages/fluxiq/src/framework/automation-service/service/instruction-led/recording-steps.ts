import type { JsonObject } from "../../../../core/index.ts";
import type { TimelineEntry } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioRecordedStepReader } from "../../nodes/index.ts";
import { markReplacedChoices } from "./replaced-choices.ts";

// What the build model is told a recording showed, step by step, in order:
// the kind of act, the control's own label and role, and whether a later step
// undid it. Nothing a person typed or chose, no text beyond the control's
// label, no address, and nothing at all from a secret or payment field: such a
// step is left out and only counted. Evidence of what the person did, mistakes
// they undid included, never a script (`./recordings.ts`).
//
// **What Core reads and what the domain reads.** An entry's act and its control
// are the domain's own record, so its implementation bundle reads them
// (`recordedStepReader`). Core keeps what holds for any domain: the order, the
// undoing, the bounds, and the two screens below, which every reading passes
// through whatever the domain said.
//
// **It fails closed.** A secret's step reaching the model cannot be taken back,
// so with no reader every step is withheld and only counted: Core has no way to
// tell a secret's step from any other, and it never guesses.

export const RECORDING_STEPS_MAX = 100;
const LABEL_MAX = 80;
const KIND_MAX = 40;

export type SupportingRecordingStep = { kind: string; label?: string; role?: string; valueEntered?: true; undone?: true; undoes?: number };
export type SupportingRecordingSteps = { steps: SupportingRecordingStep[]; stepsTruncated: boolean; withheldSteps: number };

const TOGGLE_ROLE = /^(checkbox|switch|menuitemcheckbox)$/;
// A control whose own words say it holds a secret or payment detail. A generic rule over words, whatever domain they came from, so it stays here.
const SENSITIVE = /(pass(word|code|phrase)?\b|passwd|\bpin\b|secret|token|\botp\b|one[- ]time|cvv|cvc|\bcard|ccnum|cc-|iban|routing|account[ _-]?number|security[ _-]?code|expir|credit|payment|ssn|social[ _-]?security)/i;

function cleanLabel(value: string | undefined): string | undefined {
  const label = value?.replace(/\s+/g, " ").trim();
  if (!label || /[a-z][a-z0-9+.-]*:\/\//i.test(label) || /\d[\d\s-]{11,}\d/.test(label) || /\S+@\S+\.\S+/.test(label)) return undefined;
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
}

function kindOf(raw: string): string {
  return (raw.split(".").pop() ?? raw).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, KIND_MAX) || "step";
}

function rawKind(entry: TimelineEntry): string | undefined {
  if (entry.type === "action") return entry.actionType;
  return entry.type === "domain_event" ? entry.eventType : undefined;
}

/** The steps a recording's timeline shows, screened for the build model. With no `read`, every step is withheld (see the header). */
export function supportingRecordingSteps(timeline: readonly TimelineEntry[], read: AutomationStudioRecordedStepReader | undefined): SupportingRecordingSteps {
  const actions = timeline.filter(entry => entry.type === "action");
  const source = actions.length ? actions : timeline.filter(entry => entry.type === "domain_event");
  const steps: SupportingRecordingStep[] = [];
  const lastOnControl = new Map<string, number>();
  let withheldSteps = 0;
  for (const entry of source) {
    const raw = rawKind(entry);
    if (raw === undefined) continue;
    const kind = kindOf(raw);
    if (!read) {
      withheldSteps += 1;
      continue;
    }
    const reading = read({ kind, entry });
    if (reading === null) continue;
    if (reading.secret || SENSITIVE.test(reading.identity.join(" "))) {
      withheldSteps += 1;
      continue;
    }
    const entering = reading.entersValue;
    const role = cleanLabel(reading.role);
    const label = cleanLabel(reading.label);
    const step: SupportingRecordingStep = { kind, ...(label ? { label } : {}), ...(role ? { role } : {}), ...(entering ? { valueEntered: true as const } : {}) };
    const index = steps.length;
    const key = label ? `${role ?? ""}|${label.toLowerCase()}` : undefined;
    if (reading.undoes) {
      for (let back = index - 1; back >= 0; back -= 1) {
        const earlier = steps[back]!;
        if (earlier.undone || earlier.undoes !== undefined) continue;
        earlier.undone = true;
        step.undoes = back + 1;
        break;
      }
    } else if (key) {
      const previous = lastOnControl.get(key);
      const earlier = previous === undefined ? undefined : steps[previous];
      if (earlier && !earlier.undone && earlier.undoes === undefined) {
        if (entering && earlier.valueEntered) earlier.undone = true;
        else if (!entering && role && TOGGLE_ROLE.test(role) && earlier.kind === kind) {
          earlier.undone = true;
          step.undoes = previous! + 1;
        }
      }
      lastOnControl.set(key, index);
    }
    steps.push(step);
  }
  markReplacedChoices(steps);
  return { steps: steps.slice(0, RECORDING_STEPS_MAX), stepsTruncated: steps.length > RECORDING_STEPS_MAX, withheldSteps };
}

export function supportingRecordingStepsJson(timeline: readonly TimelineEntry[], read: AutomationStudioRecordedStepReader | undefined): JsonObject {
  const { steps, stepsTruncated, withheldSteps } = supportingRecordingSteps(timeline, read);
  return { steps: steps as unknown as JsonObject[], stepsTruncated, withheldSteps };
}
