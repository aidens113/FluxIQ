// Which target a call acts on (`design.md`: a handle through the row map, or the
// frozen target's stable fields, never a position).
//
// **Read off the real calls (web domain, `node-run/run.ts`).** A model writes
// `{ target: { handle: "t12" } }`. What the node ran with, and what the Flow's node
// keeps, is an address and an element's fingerprint. A handle names one control for as
// long as a Flow is being authored (`llm-evidence/stable-handles.ts`), so it is an
// identity while exploring; the frozen form is the identity from then on. So an act
// answers to several keys, one per form it was seen in, and matches on any.
//
// **Address and fingerprint are each enough.** A Flow's step can keep an address and a
// thinner or richer fingerprint than the press that proved it. The same address or the
// same whole fingerprint, with the same inputs, is the same act. Missing a match here
// means a lasting act done twice, which is what this record exists to stop. An address
// that counts siblings is a position, so it stands only when nothing else does.
//
// **Core names no field of a domain's target.** `handle`, `target` and `element` are
// Core's own words; how a domain spells an address is not, and Core does not read a
// browser's fields (`scripts/structure-audit/rules/web-vocabulary.mjs`). So an address is
// told by its shape (`./address-shape.ts`): a parameter holding one leaves the inputs a
// fingerprint is compared with, and every other parameter is an input. A fingerprint's
// words are read the same way, whichever fields hold them, and only a structural field
// (`STRUCTURAL_FIELD`, which every control of a kind shares) is left out of them.
//
// **What is not identity.** Everything Core or the model adds to a step's parameters
// that does not change what it does: how long to wait, what to expect, how to record.
// Read by a list, since a list is what the assembly adds from; a new such key the list
// misses makes an act look new, which the Lab's double-act oracle exists to catch (D6).

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioAttemptActCountsPlaces, automationStudioAttemptActIsAddress } from "./address-shape.ts";
import { automationStudioAttemptActDigest } from "./digest.ts";
import { automationStudioAttemptActOwnFields } from "./fields.ts";

const SLOT_TARGET = "target";
const SLOT_ELEMENT = "element";
const SLOT_HANDLE = "handle";

/** Parameters that say how a step runs and never which act it is (header). */
const NOT_IDENTITY = /^(?:consequences|ensureState|effect|expected.*|wait.*|timeout.*|retr(?:y|ies).*|maxRetries|maxAttempts|pace.*|delay.*|settle.*|record.*|optional|metadata|description|notes?|label|scroll.*|force|routeSignatures|confidence|visualTarget)$/u;
/** A fingerprint field that is a place on a page, not the control. */
export const POSITIONAL_FIELD = /^(?:nth.*|index|position|ordinal|bounds|documentBounds|rect|box|x|y|left|top|right|bottom|width|height|anchor|frameId|layerId|documentLayerId)$/iu;
/**
 * A fingerprint field every control of a kind shares, or that names one row's copy: no words a person tells a control by.
 * A kind is read by its field's ending, however a domain qualifies it (`implicitRole`, `inputType`): every button of a
 * page says "button", so read as words it made a page's close button the same act as an "Accept" pressed before it
 * (`run-mwaszqeh-cc316c6d`, `../tests/kind-is-no-control-word.test.ts`).
 */
export const STRUCTURAL_FIELD = /^(?:tag.*|\w*role|\w*type|\w*kind|class.*|id|name|path|href|src|attributes?)$/iu;
const LETTER = /\p{L}/u;

export type AutomationStudioAttemptActTargetKeys = {
  /** Every key the call answers to; the first is the one its act id is built from. */
  keys: string[];
  /** The handle form, when the call named a handle. */
  handleKeys: string[];
  handle?: string;
  /** It names an element by a fingerprint, words or none: two of those whose keys differ are two controls (`../record.ts`). */
  fingerprinted?: true;
  /** Digests of the words its fingerprint holds, which tell two controls of one row apart. */
  controls?: string[];
  /** The key that names it by what the call holds beside its fingerprint: an address and inputs. A subset of `keys`. Empty where it has only a fingerprint or a handle, or where its address counts places. */
  wholeKeys: string[];
  /** The key of an address that counts places and the fingerprint beside it, together: a position alone names nothing, and the two as one are this form exactly. Kept apart from `keys`, for an act to answer to the form it was foreseen in (`../record.ts`, "Before it is sent"). */
  placeKeys: string[];
  /** Every word its fingerprint says, at any depth, for comparing with a row's (`../row-ties.ts`). Page words: never kept. */
  says?: string;
};

/** The target keys of `actionId` sent `parameters`, each its own digest (header). */
export function automationStudioAttemptActTargetKeys(actionId: string, parameters: JsonObject): AutomationStudioAttemptActTargetKeys {
  const flat = flattened(parameters);
  const handle = text(flat[SLOT_HANDLE]);
  const named = record(flat[SLOT_ELEMENT]);
  const fingerprint = named ? stableFingerprint(named) : undefined;
  const rest: JsonObject = {};
  for (const [key, value] of Object.entries(flat)) if (key !== SLOT_HANDLE && key !== SLOT_ELEMENT && !NOT_IDENTITY.test(key) && value !== undefined) rest[key] = value;
  const inputs = Object.fromEntries(Object.entries(rest).filter(([, value]) => typeof value !== "string" || !automationStudioAttemptActIsAddress(value)));
  // A handle is read beside the fields and never among them, since what a read mints is taken out of those.
  const key = (form: unknown, named?: string) => automationStudioAttemptActDigest({ actionId, handle: named ?? null, form: automationStudioAttemptActOwnFields(form) });
  const counted = Object.values(rest).some((value) => typeof value === "string" && automationStudioAttemptActCountsPlaces(value));
  const byFingerprint = fingerprint ? [key({ element: fingerprint, inputs })] : [];
  const handleKeys = handle !== undefined ? [key({ inputs }, handle)] : [];
  // With only a handle, what is left is its inputs, and those are no target at all.
  const byWhole = handle === undefined && !(fingerprint && counted) && (Object.keys(rest).length > 0 || !fingerprint) ? [key({ rest })] : [];
  const placeKeys = handle === undefined && fingerprint && counted ? [key({ element: fingerprint, rest })] : [];
  const controls = named ? controlWords(named) : [];
  const says = named ? wordsIn(named).join(" ") : "";
  return {
    keys: [...byFingerprint, ...byWhole, ...handleKeys],
    handleKeys,
    ...(handle !== undefined ? { handle } : {}),
    ...(fingerprint ? { fingerprinted: true as const } : {}),
    ...(controls.length > 0 ? { controls } : {}),
    wholeKeys: byWhole,
    placeKeys,
    ...(says ? { says } : {})
  };
}

/** The parameters with what a `target` object holds lifted beside them; a bare `target` word is a handle by another spelling. */
function flattened(parameters: JsonObject): JsonObject {
  const { [SLOT_TARGET]: slot, ...others } = parameters;
  if (typeof slot === "string" && slot.trim()) return { [SLOT_HANDLE]: slot, ...others };
  const inner = record(slot);
  return inner ? { ...inner, ...others } : others;
}

/** A fingerprint without what a read minted or where the page drew it; none where nothing is left. */
function stableFingerprint(named: JsonObject): JsonObject | undefined {
  const kept: JsonObject = {};
  for (const [key, value] of Object.entries(named)) if (!POSITIONAL_FIELD.test(key) && !(typeof value === "string" && automationStudioAttemptActIsAddress(value))) kept[key] = value;
  const fields = automationStudioAttemptActOwnFields(kept) as JsonObject;
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/** Whether a row says nothing but what a control's own words say: `controls` is the target's, as `controlWords` digests them. */
export function automationStudioAttemptActRowSaysOnlyControl(row: JsonObject, controls: readonly string[] | undefined): boolean {
  if (!controls?.length) return false;
  const values = Object.values(automationStudioAttemptActOwnFields(row) as JsonObject);
  return values.length > 0 && values.every((value) => typeof value === "string" && controls.includes(automationStudioAttemptActDigest(value.trim().toLowerCase().replace(/\s+/gu, " "))));
}

/** A digest of each thing a fingerprint's fields say in words, whichever fields say it (header). */
function controlWords(named: JsonObject): string[] {
  const words = new Set<string>();
  for (const [key, value] of Object.entries(named)) {
    if (POSITIONAL_FIELD.test(key) || STRUCTURAL_FIELD.test(key) || typeof value !== "string" || automationStudioAttemptActIsAddress(value) || !LETTER.test(value)) continue;
    words.add(automationStudioAttemptActDigest(value.trim().toLowerCase().replace(/\s+/gu, " ")));
  }
  return [...words];
}

/** Every string a fingerprint holds in words, nested ones too: a control a page repeats holds the words of the row it sits in. */
function wordsIn(named: JsonObject): string[] {
  const words: string[] = [];
  const walk = (value: JsonValue | undefined): void => {
    if (typeof value === "string") {
      if (!automationStudioAttemptActIsAddress(value) && LETTER.test(value)) words.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) if (!POSITIONAL_FIELD.test(key) && !STRUCTURAL_FIELD.test(key)) walk(item);
    }
  };
  walk(named);
  return words;
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
