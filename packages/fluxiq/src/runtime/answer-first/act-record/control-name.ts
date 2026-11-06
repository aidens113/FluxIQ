// The control an act pressed, in its own word, for the line a person reads ("Save", not "Changed something that was
// already there"), where nothing gave the words directly: a press by hand whose control the domain could not name
// after the page moved. The control's fingerprint still holds them. Core names no field of a domain's target, so this
// reads the fingerprint by shape as `./identity/target-keys.ts` does: its own top-level words, never a structural or
// positional field and never an address. The words of a row the control sits in are nested, so they are not read, and a
// long string is a sentence off the page, not a control's name. The shortest left is taken: a control's name is shorter
// than the line that describes it. The caller screens it as person words (`./words.ts`).

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { automationStudioAttemptActIsAddress, POSITIONAL_FIELD, STRUCTURAL_FIELD } from "./identity/index.ts";

const LETTER = /\p{L}/u;
const MOST_WORDS = 4;
const MOST_CHARACTERS = 40;

export function automationStudioAttemptActControlName(parameters: JsonObject | undefined): string | undefined {
  const element = elementOf(parameters);
  if (element === undefined) return undefined;
  const names = Object.entries(element)
    .filter(([key, value]) => !POSITIONAL_FIELD.test(key) && !STRUCTURAL_FIELD.test(key) && typeof value === "string")
    .map(([, value]) => (value as string).trim().replace(/\s+/gu, " "))
    .filter((value) => LETTER.test(value) && value.length <= MOST_CHARACTERS && value.split(" ").length <= MOST_WORDS && !automationStudioAttemptActIsAddress(value));
  return names.sort((a, b) => a.length - b.length)[0];
}

function elementOf(parameters: JsonObject | undefined): JsonObject | undefined {
  const own = object(parameters?.element);
  if (own !== undefined) return own;
  return object(object(parameters?.target)?.element);
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
