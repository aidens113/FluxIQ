// The card of one version of a subflow in a project's library (plan, The Subflow
// Library). It is what search reads and what a guard checks before a run, and a match
// on it only ever produces an offer. A card is what a person and the model read about
// a part: it holds no page text and no page address, and its signatures are hashes.

import { readAttemptActClasses, type AutomationStudioAttemptActClass } from "./attempt-act.ts";
import { hasOnlyKeys, isCount, isDigest, isId, isMemberOf, isPlainRecord } from "./field-checks.ts";
import { parseTotally } from "./parse-totally.ts";
import { AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS } from "./limits.ts";
import { isPersonWords, looksLikeToken } from "./person-words.ts";
import { AUTOMATION_STUDIO_TRUST_TIERS, type AutomationStudioTrustTier } from "./trust.ts";

/** A value a part takes or hands back. Its binding stays in the part's own graph. */
export type AutomationStudioSubflowCardPort = { id: string; name: string; required: boolean };

/**
 * A check at a part's start or end, by reference. The fact conditions themselves
 * stay in the part version's snapshot, because a condition's target is in the host's
 * own form and its value may be a literal off a page: neither belongs on a card.
 */
export type AutomationStudioSubflowCardCheck = {
  /** The digest of its fact conditions. */
  digest: string;
  /** How many conditions it asks. */
  conditions: number;
  /** What it asks, in a person's words. */
  says?: string;
};

/** Another version a part calls. A pin: versions are immutable. */
export type AutomationStudioSubflowCardCall = { partId: string; version: number };

/** Derived, never set by hand, per part version. */
export type AutomationStudioSubflowCardTrust = {
  tier: AutomationStudioTrustTier;
  counts: {
    /** Judged yes, ever. */
    judgedYes: number;
    /** Zero-model runs since the last failure: the count that earns `established`. */
    zeroModelRuns: number;
    /** Failures, ever. */
    failures: number;
  };
  /** Epoch milliseconds. Set exactly when `counts.failures` is above zero. */
  lastFailureAtMs?: number;
};

export type AutomationStudioSubflowCard = {
  partId: string;
  /** From 1. A repair makes a new version and never edits one. */
  version: number;
  name: string;
  /** What it is for, in a person's words. */
  purpose: string;
  /** Origins it runs on: a scheme and a host, no path and no query. */
  sites: string[];
  inputs: AutomationStudioSubflowCardPort[];
  outputs: AutomationStudioSubflowCardPort[];
  /**
   * The literals held in its steps, screened by the writer, and shown because the
   * worst false match is a fixed value: a part saved from "add the red shoes" passes
   * every page check on the wrong item. Bounded, and refused when one is shaped like
   * a credential.
   */
  fixedValues: string[];
  /** The lasting classes its steps can cause, in Core's display order. */
  lastingClasses: AutomationStudioAttemptActClass[];
  startCheck?: AutomationStudioSubflowCardCheck;
  endCheck?: AutomationStudioSubflowCardCheck;
  /** The versions it calls. */
  calls: AutomationStudioSubflowCardCall[];
  /** Hash of its steps' shape, which stops a duplicate at save. */
  shapeHash: string;
  trust: AutomationStudioSubflowCardTrust;
};

export type AutomationStudioSubflowCardParseResult =
  | { ok: true; card: AutomationStudioSubflowCard }
  | { ok: false; issues: string[] };

const CARD_KEYS: ReadonlySet<string> = new Set(["partId", "version", "name", "purpose", "sites", "inputs", "outputs", "fixedValues", "lastingClasses", "startCheck", "endCheck", "calls", "shapeHash", "trust"]);
const PORT_KEYS: ReadonlySet<string> = new Set(["id", "name", "required"]);
const CHECK_KEYS: ReadonlySet<string> = new Set(["digest", "conditions", "says"]);
const CALL_KEYS: ReadonlySet<string> = new Set(["partId", "version"]);
const TRUST_KEYS: ReadonlySet<string> = new Set(["tier", "counts", "lastFailureAtMs"]);
const COUNTS_KEYS: ReadonlySet<string> = new Set(["judgedYes", "zeroModelRuns", "failures"]);

/**
 * Parses an untrusted value into a card, returning fresh objects. Exact fields: an
 * unknown key, class or tier is refused, as is a site that is more than an origin, a
 * part that calls itself, and a tier its counts have not earned. Issues are stable
 * codes prefixed `subflow_card.`, each listed once.
 */
export function parseAutomationStudioSubflowCard(value: unknown): AutomationStudioSubflowCardParseResult {
  const parsed = parseTotally("subflow_card", (issues) => readCard(value, issues));
  return parsed.ok ? { ok: true, card: parsed.value } : parsed;
}

function readCard(value: unknown, issues: Set<string>): AutomationStudioSubflowCard | null {
  if (!isPlainRecord(value)) {
    issues.add("subflow_card.not_object");
    return null;
  }
  if (!hasOnlyKeys(value, CARD_KEYS)) issues.add("subflow_card.unknown_key");
  const { partId, version, name, purpose, shapeHash } = value;
  const sites = readSites(value.sites);
  const inputs = readPorts(value.inputs);
  const outputs = readPorts(value.outputs);
  const fixedValues = readFixedValues(value.fixedValues);
  const lastingClasses = readAttemptActClasses(value.lastingClasses);
  const startCheck = value.startCheck === undefined ? undefined : readCheck(value.startCheck);
  const endCheck = value.endCheck === undefined ? undefined : readCheck(value.endCheck);
  const calls = readCalls(value.calls);
  const trust = readTrust(value.trust);
  if (!isId(partId)) issues.add("subflow_card.invalid_part_id");
  if (!isCount(version) || version < 1) issues.add("subflow_card.invalid_version");
  if (!isPersonWords(name, LIMITS.nameMaxLength)) issues.add("subflow_card.invalid_name");
  if (!isPersonWords(purpose)) issues.add("subflow_card.invalid_purpose");
  if (sites === null) issues.add("subflow_card.invalid_sites");
  if (inputs === null) issues.add("subflow_card.invalid_inputs");
  if (outputs === null) issues.add("subflow_card.invalid_outputs");
  if (fixedValues === null) issues.add("subflow_card.invalid_fixed_values");
  if (lastingClasses === null) issues.add("subflow_card.invalid_lasting_classes");
  if (startCheck === null) issues.add("subflow_card.invalid_start_check");
  if (endCheck === null) issues.add("subflow_card.invalid_end_check");
  if (calls === null) issues.add("subflow_card.invalid_calls");
  else if (calls.some((call) => call.partId === partId && call.version === version)) issues.add("subflow_card.calls_itself");
  if (!isDigest(shapeHash)) issues.add("subflow_card.invalid_shape_hash");
  if (trust === null) issues.add("subflow_card.invalid_trust");
  else if (!trustEarned(trust)) issues.add("subflow_card.trust_not_earned");
  if (issues.size > 0) return null;
  if (!isId(partId) || !isCount(version) || !isPersonWords(name, LIMITS.nameMaxLength) || !isPersonWords(purpose) || !isDigest(shapeHash)) return null;
  if (sites === null || inputs === null || outputs === null || fixedValues === null || lastingClasses === null || startCheck === null || endCheck === null || calls === null || trust === null) return null;
  const card: AutomationStudioSubflowCard = { partId, version, name, purpose, sites, inputs, outputs, fixedValues, lastingClasses, calls, shapeHash, trust };
  if (startCheck !== undefined) card.startCheck = startCheck;
  if (endCheck !== undefined) card.endCheck = endCheck;
  return card;
}

function readSites(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.listMaxEntries) return null;
  return value.every(isOrigin) ? [...value] as string[] : null;
}

function isOrigin(value: unknown): boolean {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const site = new URL(value);
  return (site.protocol === "http:" || site.protocol === "https:") && site.origin === value;
}

function readPorts(value: unknown): AutomationStudioSubflowCardPort[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.listMaxEntries) return null;
  const ports: AutomationStudioSubflowCardPort[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, PORT_KEYS)) return null;
    const { id, name, required } = item;
    if (!isId(id) || seen.has(id) || !isPersonWords(name, LIMITS.nameMaxLength) || typeof required !== "boolean") return null;
    seen.add(id);
    ports.push({ id, name, required });
  }
  return ports;
}

function readFixedValues(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.listMaxEntries) return null;
  const fine = value.every((item) => typeof item === "string" && item.length > 0 && item.length <= LIMITS.wordsMaxLength && !looksLikeToken(item));
  return fine ? [...value] as string[] : null;
}

function readCheck(value: unknown): AutomationStudioSubflowCardCheck | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, CHECK_KEYS)) return null;
  const { digest, conditions, says } = value;
  if (!isDigest(digest) || !isCount(conditions) || conditions < 1) return null;
  if (says === undefined) return { digest, conditions };
  return isPersonWords(says) ? { digest, conditions, says } : null;
}

function readCalls(value: unknown): AutomationStudioSubflowCardCall[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.listMaxEntries) return null;
  const calls: AutomationStudioSubflowCardCall[] = [];
  for (const item of value) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, CALL_KEYS)) return null;
    const { partId, version } = item;
    if (!isId(partId) || !isCount(version) || version < 1) return null;
    calls.push({ partId, version });
  }
  return calls;
}

function readTrust(value: unknown): AutomationStudioSubflowCardTrust | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, TRUST_KEYS) || !isPlainRecord(value.counts) || !hasOnlyKeys(value.counts, COUNTS_KEYS)) return null;
  const { tier, lastFailureAtMs } = value;
  const { judgedYes, zeroModelRuns, failures } = value.counts;
  if (!isMemberOf(AUTOMATION_STUDIO_TRUST_TIERS, tier) || !isCount(judgedYes) || !isCount(zeroModelRuns) || !isCount(failures)) return null;
  const counts = { judgedYes, zeroModelRuns, failures };
  if (lastFailureAtMs === undefined) return failures === 0 ? { tier, counts } : null;
  return isCount(lastFailureAtMs) && failures > 0 ? { tier, counts, lastFailureAtMs } : null;
}

/** A tier says only what its counts show: `provisional` needs a yes, `established` the zero-model runs that earn it. */
function trustEarned(trust: AutomationStudioSubflowCardTrust): boolean {
  if (trust.tier === "established") return trust.counts.zeroModelRuns >= LIMITS.establishedZeroModelRuns;
  if (trust.tier === "provisional") return trust.counts.judgedYes + trust.counts.zeroModelRuns >= 1;
  return true;
}
