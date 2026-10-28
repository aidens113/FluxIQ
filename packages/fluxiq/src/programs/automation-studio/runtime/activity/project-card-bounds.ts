import { cutAtWord } from "../../../../ui/index.ts";
import type { ClientGatewayActivityProjectCard } from "@fluxiq/contracts/client-gateway";

// The bounds on a `note` row's project card (`ClientGatewayActivityProjectCard`):
// the supervisor's plan, a brief it dispatched, a builder's return, and a
// trial receipt. `boundedDetail` (`./bounded.ts`) copies a detail's unknown
// fields as they came, so a card is read here field by field and rebuilt: an
// extra field never reaches the wire, and a card in the wrong shape is left
// off the row, which then reads as a plain note.

type Card = ClientGatewayActivityProjectCard;
type BriefKind = Extract<Card, { kind: "brief" }>["brief"];
type ReturnOutcome = Extract<Card, { kind: "return" }>["outcome"];
type ReceiptKind = Extract<Card, { kind: "receipt" }>["receipt"];
type ReceiptVerdict = Extract<Card, { kind: "receipt" }>["verdict"];

// Records rather than lists, so a value the contract adds fails to compile here until it is bounded.
const BRIEF_KINDS: Readonly<Record<BriefKind, true>> = { build: true, survey: true, repair: true, reset: true };
const RETURN_OUTCOMES: Readonly<Record<ReturnOutcome, true>> = { done: true, partial: true, blocked: true };
const RECEIPT_KINDS: Readonly<Record<ReceiptKind, true>> = { subflow_trial: true, candidate_trial: true };
const RECEIPT_VERDICTS: Readonly<Record<ReceiptVerdict, true>> = { passed: true, failed: true, unconfirmed: true };

/** Every string at most 160 characters, a return's `reason` 240, every list 20 entries (the contract's promise). */
const LIMITS = { text: 160, reason: 240, entries: 20 } as const;
/** A brief's id: no whitespace, at most 200 characters, as a recovery's target id is. */
const BRIEF_ID = /^[^\s]{1,200}$/u;
/** A run of hex as long as a digest's: never an id a card names (the extension hides rows that show one). */
const DIGEST_LIKE = /[a-f0-9]{32,}/iu;

const READERS: Readonly<Record<Card["kind"], (fields: Record<string, unknown>) => Card | undefined>> = {
  plan: planCard,
  brief: briefCard,
  return: returnCard,
  receipt: receiptCard
};

/**
 * A project card in the contract's closed shape with every string and list
 * cut to its bound, or `undefined` when its kind, a closed field, a brief id
 * or an amount is outside the contract. Only a `note` row carries one; the
 * caller checks the row.
 */
export function boundedAutomationStudioProjectCard(card: unknown): Card | undefined {
  const fields = record(card);
  const kind = fields?.kind;
  if (!fields || typeof kind !== "string" || !Object.hasOwn(READERS, kind)) return undefined;
  return READERS[kind as Card["kind"]](fields);
}

function planCard(fields: Record<string, unknown>): Card {
  const parts = entries(fields.parts, (entry) => {
    const part = record(entry);
    const id = words(part?.id, LIMITS.text);
    const said = words(part?.words, LIMITS.text);
    return id === undefined || said === undefined ? undefined : { id, words: said };
  });
  const subflows = entries(fields.subflows, (entry) => {
    const subflow = record(entry);
    const key = words(subflow?.key, LIMITS.text);
    const name = words(subflow?.name, LIMITS.text);
    const purpose = words(subflow?.purpose, LIMITS.text);
    if (key === undefined || name === undefined || purpose === undefined) return undefined;
    return { key, name, purpose, parts: entries(subflow?.parts, (part) => words(part, LIMITS.text)) };
  });
  const cases = entries(fields.cases, (entry) => {
    const item = record(entry);
    const subflowKey = words(item?.subflowKey, LIMITS.text);
    const caseId = words(item?.caseId, LIMITS.text);
    return subflowKey === undefined || caseId === undefined ? undefined : { subflowKey, caseId };
  });
  const budget = entries(fields.budget, (entry) => {
    const item = record(entry);
    const subflowKey = words(item?.subflowKey, LIMITS.text);
    const usd = amount(item?.usd);
    return subflowKey === undefined || usd === undefined ? undefined : { subflowKey, usd };
  });
  const reserveUsd = amount(fields.reserveUsd);
  return {
    kind: "plan",
    parts,
    subflows,
    ...(fields.cases === undefined ? {} : { cases }),
    ...(fields.budget === undefined ? {} : { budget }),
    ...(reserveUsd === undefined ? {} : { reserveUsd })
  };
}

function briefCard(fields: Record<string, unknown>): Card | undefined {
  const briefId = briefIdOf(fields.briefId);
  const brief = closed(fields.brief, BRIEF_KINDS);
  const subflowKey = words(fields.subflowKey, LIMITS.text);
  const subflowName = words(fields.subflowName, LIMITS.text);
  const purpose = words(fields.purpose, LIMITS.text);
  const allowanceUsd = amount(fields.allowanceUsd);
  const caseId = words(fields.caseId, LIMITS.text);
  // The subflows it starts after, by name (t649): kept only as a list of words, an empty one too (it starts after none).
  const after = entries(fields.after, (name) => words(name, LIMITS.text));
  const afterSent = Array.isArray(fields.after);
  if (briefId === undefined || brief === undefined || subflowKey === undefined || subflowName === undefined || purpose === undefined || allowanceUsd === undefined) return undefined;
  return { kind: "brief", briefId, brief, subflowKey, subflowName, purpose, ...(caseId === undefined ? {} : { caseId }), allowanceUsd, ...(afterSent ? { after } : {}) };
}

function returnCard(fields: Record<string, unknown>): Card | undefined {
  const briefId = briefIdOf(fields.briefId);
  const subflowKey = words(fields.subflowKey, LIMITS.text);
  const outcome = closed(fields.outcome, RETURN_OUTCOMES);
  const reason = words(fields.reason, LIMITS.reason);
  const spentUsd = amount(fields.spentUsd);
  const calls = count(fields.calls);
  const trials = count(fields.trials);
  if (briefId === undefined || subflowKey === undefined || outcome === undefined || reason === undefined || spentUsd === undefined || calls === undefined || trials === undefined) return undefined;
  return { kind: "return", briefId, subflowKey, outcome, reason, spentUsd, calls, trials };
}

function receiptCard(fields: Record<string, unknown>): Card | undefined {
  const briefId = briefIdOf(fields.briefId);
  const receipt = closed(fields.receipt, RECEIPT_KINDS);
  const receiptId = words(fields.receiptId, LIMITS.text);
  const verdict = closed(fields.verdict, RECEIPT_VERDICTS);
  if ((fields.briefId !== undefined && briefId === undefined) || receipt === undefined || receiptId === undefined || verdict === undefined) return undefined;
  return { kind: "receipt", ...(briefId === undefined ? {} : { briefId }), receipt, receiptId, verdict };
}

/** A brief's id when it is id-shaped and not a digest. */
function briefIdOf(value: unknown): string | undefined {
  return typeof value === "string" && BRIEF_ID.test(value) && !DIGEST_LIKE.test(value) ? value : undefined;
}

function closed<T extends string>(value: unknown, allowed: Readonly<Record<T, true>>): T | undefined {
  return typeof value === "string" && Object.hasOwn(allowed, value) ? value as T : undefined;
}

/** Trimmed and cut to `max`; nothing when not a string or empty once trimmed. */
function words(value: unknown, max: number): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return undefined;
  return cutAtWord(trimmed, max);
}

function amount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** A list's first `LIMITS.entries` entries as `read` reads them, leaving out the ones it refuses. */
function entries<T>(value: unknown, read: (entry: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  const kept: T[] = [];
  for (const entry of value.slice(0, LIMITS.entries)) {
    const bounded = read(entry);
    if (bounded !== undefined) kept.push(bounded);
  }
  return kept;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
