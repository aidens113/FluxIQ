// The literals a part's steps hold fixed, which a card shows because the worst
// false match for a part is a fixed value: a part saved from "add the red shoes"
// passes every page check on the wrong item.
//
// What counts as one: a literal a step TYPES or chooses (under a value key), never
// a binding to an input, a step's output or run state. A target's own text is page
// evidence and is listed only when the person's request holds it too, since then
// it is their word and not the page's. A literal shaped like a credential, or
// sitting under a key that names one, makes the part ineligible: it is refused,
// never stored and never shown.
import type { JsonValue } from "../../../core/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../components/automation/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "../../../engine/automation/defensive/index.ts";
import { PART_SECRET_KEY, PART_VALUE_KEYS, type AutomationStudioPartControlReading } from "./parameter-keys.ts";
import type { AutomationStudioPartStep } from "./steps.ts";

/** The most characters of a fixed value a card carries (`wordsMaxLength`). */
const VALUE_MAX = 500;
const BEARER = /\bbearer\s+\S/iu;
const TOKEN_RUN = /[A-Za-z0-9_+/=]{32,}/gu;

export type AutomationStudioPartFixedValues = {
  values: string[];
  /** One of them also occurs in the person's request, so it is their words. */
  fromRequest: boolean;
  problem?: "part.fixed_value_unusable" | "part.secret_shaped_value";
};

export function partFixedValuesOf(steps: readonly AutomationStudioPartStep[], requestWords: string, control: AutomationStudioPartControlReading): AutomationStudioPartFixedValues {
  const request = normalised(requestWords);
  const values: string[] = [];
  let fromRequest = false;
  const keep = (text: string, shownAnyway: boolean, whole = false): void => {
    if (!text) return;
    const inRequest = request.length > 0 && normalised(text).length >= 2 && (whole ? occursWhole(request, normalised(text)) : request.includes(normalised(text)));
    if (inRequest) fromRequest = true;
    if ((shownAnyway || inRequest) && !values.includes(text)) values.push(text);
  };
  for (const step of steps) {
    if (!step.acting || step.isCall) continue;
    for (const [key, value] of Object.entries(step.params)) {
      if (control.controlKeys.has(key)) {
        for (const text of targetTexts(value, control)) if (!isOwnLabelOfLastingStep(step, text)) keep(text, false, true);
        continue;
      }
      const literals = literalsOf(value);
      if (PART_SECRET_KEY.test(key) && literals.length > 0) return { values: [], fromRequest: false, problem: "part.secret_shaped_value" };
      if (!PART_VALUE_KEYS.has(key)) continue;
      for (const text of literals) {
        if (looksLikeSecret(text)) return { values: [], fromRequest: false, problem: "part.secret_shaped_value" };
        if (text.length > VALUE_MAX) return { values: [], fromRequest: false, problem: "part.fixed_value_unusable" };
        keep(text, true);
      }
    }
  }
  return { values, fromRequest };
}

/** The string and number literals a parameter holds, as text. A binding, and anything below one, holds none. */
function literalsOf(value: JsonValue | undefined): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => typeof item === "string" || typeof item === "number" ? literalsOf(item) : []);
}

/** The words the domain reads a control by, from its target. A target that is only a handle, or a binding, has none. */
function targetTexts(target: JsonValue | undefined, control: AutomationStudioPartControlReading): string[] {
  if (!target || typeof target !== "object" || Array.isArray(target) || isAutomationNodeParameterStateBinding(target)) return [];
  return control.targetWords(target).map((text) => text.trim()).filter((text) => text.length > 0 && text.length <= VALUE_MAX);
}

/** The step acts lastingly and the text is part of its own label: the control it presses, not an item it picks. */
function isOwnLabelOfLastingStep(step: AutomationStudioPartStep, text: string): boolean {
  const declared = step.node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  const label = normalised(step.node.label ?? "");
  return Array.isArray(declared) && declared.length > 0 && label.length > 0 && occursWhole(label, normalised(text));
}

/** The text sits in the words as whole words, not inside a longer one. Both are already normalised. */
function occursWhole(words: string, text: string): boolean {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(String.raw`(?<![\p{L}\p{N}])` + escaped + String.raw`(?![\p{L}\p{N}])`, "u").test(words);
}

function looksLikeSecret(text: string): boolean {
  if (BEARER.test(text)) return true;
  return (text.match(TOKEN_RUN) ?? []).some((run) => /[0-9]/u.test(run) && /[A-Za-z]/u.test(run));
}

function normalised(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}
