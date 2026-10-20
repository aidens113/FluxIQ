import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetSpot, AutomationStudioSiteResetTrialActPlace } from "../site-reset/index.ts";
import type { AutomationStudioCandidateTrialAct } from "./contracts.ts";

// A trial port's acts, as the whole-candidate trial gate keeps them
// (`./trial-gate.ts`, t609; L1). The port answers each landed act with where
// its step sat and what it made, read off the step's own state diff
// (`../../service/candidate-trial/landed-acts.ts`): `spot` with every token
// (item, dialog, subject, page, scope, resource, place, state), `controls`
// (the step control's place before and after it, and its page's location,
// L1 d7), `collections` (the complete
// inventories around it) and `created`. Each is copied whole, every token held
// to the declaration's opaque form; a malformed one is dropped from its act and
// the act kept, as the ledger records an act without it.
//
// Which acts are kept does not change here: only an act with a declared lasting
// consequence is (an act whose step declared none, `possible`, is a project
// build's to record, `../site-reset/ledger.ts`), and a malformed entry is
// dropped rather than refusing the verdict it rides on.

/** A trial's lasting act as this gate keeps it: the act, with where its step sat and what it made. */
type KeptTrialAct = AutomationStudioCandidateTrialAct & AutomationStudioSiteResetTrialActPlace;

/** A trial's lasting acts, each copied with every field the ledger reads (header). */
export function automationStudioCandidateTrialActs(value: unknown): KeptTrialAct[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<unknown>(AUTOMATION_STUDIO_ACTION_CONSEQUENCES);
  return value.flatMap((entry): KeptTrialAct[] => {
    if (!isJsonObject(entry) || typeof entry.step !== "number" || !Number.isSafeInteger(entry.step) || typeof entry.definitionId !== "string" || !entry.definitionId) return [];
    if (!Array.isArray(entry.consequences) || !entry.consequences.length || !entry.consequences.every((consequence) => known.has(consequence))) return [];
    if ((entry.label !== undefined && typeof entry.label !== "string") || (entry.control !== undefined && typeof entry.control !== "string")) return [];
    const spot = spotOf(entry.spot);
    const created = createdOf(entry.created);
    const controls = controlsOf(entry.controls);
    const collections = collectionsOf(entry.collections);
    const consequences = [...new Set(entry.consequences as AutomationStudioCandidateTrialAct["consequences"])];
    return [{
      step: entry.step,
      definitionId: entry.definitionId,
      ...(entry.label ? { label: entry.label } : {}),
      ...(entry.control ? { control: entry.control } : {}),
      consequences,
      ...(spot ? { spot } : {}),
      ...(created ? { created } : {}),
      ...(controls ? { controls } : {}),
      ...(collections ? { collections } : {})
    }];
  });
}

/** An opaque place token, in the form a declaration's `control.item` takes (`../../action-permissions/declaration.ts`). */
const PLACE_TOKEN = /^[A-Za-z0-9:_-]{1,128}$/u;
/** More items than any page lists is no list of what a step made. */
const MAX_ITEMS = 2_000;
const SPOT_KEYS = ["item", "dialog", "subject", "page", "scope", "resource", "place", "state"] as const;

function placeToken(value: unknown): string | undefined {
  return typeof value === "string" && PLACE_TOKEN.test(value) ? value : undefined;
}

/** A trial act's `spot`, every token it names kept (header). */
function spotOf(value: unknown): AutomationStudioSiteResetSpot | undefined {
  if (!isJsonObject(value)) return undefined;
  const spot: AutomationStudioSiteResetSpot = {};
  for (const key of SPOT_KEYS) {
    const token = placeToken(value[key]);
    if (token) spot[key] = token;
  }
  return Object.keys(spot).length ? spot : undefined;
}

/** A trial act's `controls`: a page token and two sides of state tokens with positive counts, or none; its page's location kept when well formed. */
function controlsOf(value: unknown): AutomationStudioSiteResetTrialActPlace["controls"] {
  if (!isJsonObject(value)) return undefined;
  const page = placeToken(value.page);
  const before = countsOf(value.before);
  const after = countsOf(value.after);
  if (!page || !before || !after) return undefined;
  const location = locationOf(value.location);
  return { page, ...(location ? { location } : {}), before, after };
}

/** The longest location a read or a trial step carries (`../start-location.ts`). */
const MAX_LOCATION = 2_048;

/** A page's address: a non-empty single-line string no longer than a start location, or none (dropped, the act kept). */
function locationOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_LOCATION && !/[\u0000-\u001f\u007f]/u.test(value) ? value : undefined;
}

/** State tokens and their counts, every token opaque and every count a positive safe integer, or none. */
function countsOf(value: unknown): Record<string, number> | undefined {
  if (!isJsonObject(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > MAX_ITEMS) return undefined;
  const counts: Record<string, number> = {};
  for (const [state, count] of entries) {
    if (!placeToken(state) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) return undefined;
    counts[state] = count;
  }
  return counts;
}

/** A trial act's `collections`: both sides complete inventories, every token opaque and every subject's state given, or none. */
function collectionsOf(value: unknown): AutomationStudioSiteResetTrialActPlace["collections"] {
  if (!isJsonObject(value)) return undefined;
  const before = inventoryOf(value.before);
  const after = inventoryOf(value.after);
  return before && after ? { before, after } : undefined;
}

type Inventory = NonNullable<AutomationStudioSiteResetTrialActPlace["collections"]>["before"];

/** One side's inventories, one per scope; any malformed entry makes the side none, since a partial inventory witnesses nothing. */
function inventoryOf(value: unknown): Inventory | undefined {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return undefined;
  const found: Inventory = [];
  const scopes = new Set<string>();
  for (const entry of value) {
    if (!isJsonObject(entry)) return undefined;
    const scope = placeToken(entry.scope);
    const group = placeToken(entry.group);
    const subjects = subjectsOf(entry.subjects);
    if (!scope || !group || !subjects || scopes.has(scope) || !isJsonObject(entry.states)) return undefined;
    if (Object.keys(entry.states).length !== subjects.length) return undefined;
    const states: Record<string, string> = {};
    for (const subject of subjects) {
      const state = placeToken(entry.states[subject]);
      if (!state) return undefined;
      states[subject] = state;
    }
    scopes.add(scope);
    found.push({ scope, group, subjects, states });
  }
  return found;
}

/** Distinct subject tokens, every entry a token, or none. */
function subjectsOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return undefined;
  const read = value.map(placeToken);
  if (!read.every((token): token is string => token !== undefined)) return undefined;
  return new Set(read).size === read.length ? read : undefined;
}

/** A trial act's `created`: every entry a token, or none of it. */
function createdOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > MAX_ITEMS) return undefined;
  const read = value.map(placeToken);
  return read.every((token): token is string => token !== undefined) ? [...new Set(read)] : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}
