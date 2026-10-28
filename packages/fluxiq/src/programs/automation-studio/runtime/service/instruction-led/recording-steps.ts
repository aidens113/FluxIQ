import type { JsonObject } from "../../../../../core/index.ts";
import type { TimelineEntry } from "../../../model/index.ts";
import { markReplacedChoices } from "./replaced-choices.ts";

// What the build model is told a recording showed, step by step, in order:
// the kind of act, the control's own label and role, and whether a later step
// undid it. Nothing a person typed or chose, no page text beyond the control's
// label, no address, and nothing at all from a secret or payment field: such a
// step is left out and only counted. Evidence of what the person did, mistakes
// they undid included, never a script (`./recordings.ts`).

export const RECORDING_STEPS_MAX = 100;
const LABEL_MAX = 80;
const KIND_MAX = 40;

export type SupportingRecordingStep = { kind: string; label?: string; role?: string; valueEntered?: true; undone?: true; undoes?: number };
export type SupportingRecordingSteps = { steps: SupportingRecordingStep[]; stepsTruncated: boolean; withheldSteps: number };

// Events that describe the page or the pointer rather than something the person did to a control.
const PASSIVE_KIND = /(focus|blur|scroll|wheel|mutat|snapshot|ready|error|tab_state|checkpoint|hover|move)/;
const ENTERING_KIND = /(input|change|type|typed|select|fill|enter|paste|upload)/;
const UNDOING_KIND = /(undo|back)/;
const TOGGLE_ROLE = /^(checkbox|switch|menuitemcheckbox)$/;
// A control whose name, label, id, kind or autocomplete token says it holds a secret or payment detail.
const SENSITIVE = /(pass(word|code|phrase)?\b|passwd|\bpin\b|secret|token|\botp\b|one[- ]time|cvv|cvc|\bcard|ccnum|cc-|iban|routing|account[ _-]?number|security[ _-]?code|expir|credit|payment|ssn|social[ _-]?security)/i;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function cleanLabel(value: string | undefined): string | undefined {
  const label = value?.replace(/\s+/g, " ").trim();
  if (!label || /[a-z][a-z0-9+.-]*:\/\//i.test(label) || /\d[\d\s-]{11,}\d/.test(label) || /\S+@\S+\.\S+/.test(label)) return undefined;
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
}

type Described = { kind: string; control: Record<string, unknown> };

function kindOf(raw: string): string {
  return (raw.split(".").pop() ?? raw).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, KIND_MAX) || "step";
}

function withRole(control: Record<string, unknown>): Record<string, unknown> {
  return { ...control, role: text(control.role) ?? text(control.implicitRole) };
}

function describe(entry: TimelineEntry): Described | undefined {
  if (entry.type === "action") {
    const fingerprint = record(entry.target?.elementTarget?.fingerprint) ?? {};
    // The recorded action carries the control it acted on in its parameters (`element`); a stored target carries it as a fingerprint.
    const element = record(entry.parameters.element) ?? {};
    const merged = { ...element, ...fingerprint };
    const control = { ...merged, label: text(merged.label) ?? entry.target?.label, role: text(merged.role) ?? text(merged.implicitRole), attributes: merged.attributes };
    return { kind: kindOf(entry.actionType), control };
  }
  if (entry.type === "domain_event") return { kind: kindOf(entry.eventType), control: withRole(record(record(entry.payload)?.element) ?? {}) };
  return undefined;
}

function withheld(control: Record<string, unknown>): boolean {
  const attributes = record(control.attributes) ?? {};
  const type = text(attributes.type)?.toLowerCase();
  if (type === "password") return true;
  const identity = [attributes.autocomplete, attributes.name, attributes.id, attributes.placeholder, control.id, control.name, control.accessibleName, control.label].filter((value): value is string => typeof value === "string").join(" ");
  return SENSITIVE.test(identity);
}

/** The steps a recording's timeline shows, screened for the build model. */
export function supportingRecordingSteps(timeline: readonly TimelineEntry[]): SupportingRecordingSteps {
  const actions = timeline.filter(entry => entry.type === "action");
  const source = actions.length ? actions : timeline.filter(entry => entry.type === "domain_event");
  const steps: SupportingRecordingStep[] = [];
  const lastOnControl = new Map<string, number>();
  let withheldSteps = 0;
  for (const entry of source) {
    const described = describe(entry);
    if (!described || PASSIVE_KIND.test(described.kind)) continue;
    const { kind, control } = described;
    if (withheld(control)) {
      withheldSteps += 1;
      continue;
    }
    const entering = ENTERING_KIND.test(kind);
    const role = cleanLabel(text(control.role));
    // A field's own text is its value, so a step that enters one is labelled by name alone.
    const label = cleanLabel(entering ? text(control.accessibleName) ?? text(control.name) ?? text(control.label) : text(control.accessibleName) ?? text(control.name) ?? text(control.label) ?? text(control.visibleText) ?? text(control.text));
    const step: SupportingRecordingStep = { kind, ...(label ? { label } : {}), ...(role ? { role } : {}), ...(entering ? { valueEntered: true as const } : {}) };
    const index = steps.length;
    const key = label ? `${role ?? ""}|${label.toLowerCase()}` : undefined;
    if (UNDOING_KIND.test(kind)) {
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

export function supportingRecordingStepsJson(timeline: readonly TimelineEntry[]): JsonObject {
  const { steps, stepsTruncated, withheldSteps } = supportingRecordingSteps(timeline);
  return { steps: steps as unknown as JsonObject[], stepsTruncated, withheldSteps };
}
