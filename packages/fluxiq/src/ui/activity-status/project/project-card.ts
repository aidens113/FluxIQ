// The card of the project supervisor's work one of Core's `note` rows carries,
// read from the raw activity event (automation-project-agents-plan, chat
// presentation; `ClientGatewayActivity.detail.project`).
//
// Four cards: the supervisor's `plan` (the task's parts, each subflow with its
// purpose, the starting cases, the budget split), a `brief` it dispatched to a
// builder (build, survey, repair or reset), that builder's `return`, and a
// validator's `receipt`. This is the one reader: it keeps the field only on a
// `note` row and only in the contract's shape, dropping a list entry that is
// not, so a chat never draws a card from a value an older or newer Core sent
// in another form. Core bounds the lists to 20 entries; so does this.
//
// Pure: no browser API.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** A card a `note` row carries, as the wire contract declares it. */
export type ActivityProjectCard = NonNullable<NonNullable<ClientGatewayActivity["detail"]>["project"]>;

type Plan = Extract<ActivityProjectCard, { kind: "plan" }>;
type Brief = Extract<ActivityProjectCard, { kind: "brief" }>;
type Return = Extract<ActivityProjectCard, { kind: "return" }>;
type Receipt = Extract<ActivityProjectCard, { kind: "receipt" }>;
type Fields = Record<string, unknown>;

// Records over the contract's unions, so a value Core adds or drops fails the
// typecheck here instead of being silently read.
const BRIEFS: Record<Brief["brief"], true> = { build: true, survey: true, repair: true, reset: true };
const OUTCOMES: Record<Return["outcome"], true> = { done: true, partial: true, blocked: true };
const RECEIPTS: Record<Receipt["receipt"], true> = { subflow_trial: true, candidate_trial: true };
const VERDICTS: Record<Receipt["verdict"], true> = { passed: true, failed: true, unconfirmed: true };

/** The most entries a plan's list keeps, as Core bounds it. */
const MAX_ENTRIES = 20;

/**
 * The card `event`'s note row carries, or `undefined` when the row is not a
 * note, carries none, or carries one outside the contract.
 */
export function projectCard(event: ClientGatewayActivity): ActivityProjectCard | undefined {
  const detail = event.detail;
  if (detail?.kind !== "note" || detail.project === undefined) return undefined;
  const raw = fieldsOf(detail.project);
  if (raw === undefined) return undefined;
  switch (raw.kind) {
    case "plan":
      return plan(raw);
    case "brief":
      return brief(raw);
    case "return":
      return returned(raw);
    case "receipt":
      return receipt(raw);
    default:
      return undefined;
  }
}

function plan(raw: Fields): Plan | undefined {
  const parts = entries(raw.parts, (part) => {
    const id = text(part.id);
    const words = text(part.words);
    return id && words ? { id, words } : undefined;
  });
  const subflows = entries(raw.subflows, (subflow) => {
    const key = text(subflow.key);
    const name = text(subflow.name);
    if (!key || !name) return undefined;
    const covers = Array.isArray(subflow.parts) ? subflow.parts.map(text).filter((part): part is string => part !== undefined).slice(0, MAX_ENTRIES) : [];
    return { key, name, purpose: text(subflow.purpose) ?? "", parts: covers };
  });
  if (parts === undefined || subflows === undefined || subflows.length === 0) return undefined;
  const cases = entries(raw.cases, (entry) => {
    const subflowKey = text(entry.subflowKey);
    const caseId = text(entry.caseId);
    return subflowKey && caseId ? { subflowKey, caseId } : undefined;
  });
  const budget = entries(raw.budget, (entry) => {
    const subflowKey = text(entry.subflowKey);
    const usd = amount(entry.usd);
    return subflowKey && usd !== undefined ? { subflowKey, usd } : undefined;
  });
  const reserveUsd = amount(raw.reserveUsd);
  return {
    kind: "plan",
    parts,
    subflows,
    ...(cases === undefined ? {} : { cases }),
    ...(budget === undefined ? {} : { budget }),
    ...(reserveUsd === undefined ? {} : { reserveUsd })
  };
}

function brief(raw: Fields): Brief | undefined {
  const briefId = text(raw.briefId);
  const subflowKey = text(raw.subflowKey);
  const subflowName = text(raw.subflowName);
  const allowanceUsd = amount(raw.allowanceUsd);
  if (!briefId || !subflowKey || !subflowName || allowanceUsd === undefined || !known(BRIEFS, raw.brief)) return undefined;
  const caseId = text(raw.caseId);
  // The parts it starts after, by name (since t649; empty for none): absent only from an older Core.
  const after = Array.isArray(raw.after) ? raw.after.map(text).filter((name): name is string => name !== undefined).slice(0, MAX_ENTRIES) : undefined;
  return { kind: "brief", briefId, brief: raw.brief, subflowKey, subflowName, purpose: text(raw.purpose) ?? "", ...(caseId ? { caseId } : {}), allowanceUsd, ...(after === undefined ? {} : { after }) };
}

function returned(raw: Fields): Return | undefined {
  const briefId = text(raw.briefId);
  const subflowKey = text(raw.subflowKey);
  const spentUsd = amount(raw.spentUsd);
  const calls = amount(raw.calls);
  const trials = amount(raw.trials);
  if (!briefId || !subflowKey || spentUsd === undefined || calls === undefined || trials === undefined || !known(OUTCOMES, raw.outcome)) return undefined;
  return { kind: "return", briefId, subflowKey, outcome: raw.outcome, reason: text(raw.reason) ?? "", spentUsd, calls, trials };
}

function receipt(raw: Fields): Receipt | undefined {
  const receiptId = text(raw.receiptId);
  if (!receiptId || !known(RECEIPTS, raw.receipt) || !known(VERDICTS, raw.verdict)) return undefined;
  const briefId = text(raw.briefId);
  return { kind: "receipt", ...(briefId ? { briefId } : {}), receipt: raw.receipt, receiptId, verdict: raw.verdict };
}

/**
 * A list's entries read by `read`, at most `MAX_ENTRIES`, each one that is
 * not an object or that `read` refuses dropped; `undefined` when `value` is
 * no list at all.
 */
function entries<T>(value: unknown, read: (entry: Fields) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept: T[] = [];
  for (const entry of value) {
    const fields = fieldsOf(entry);
    const found = fields === undefined ? undefined : read(fields);
    if (found !== undefined) kept.push(found);
    if (kept.length === MAX_ENTRIES) break;
  }
  return kept;
}

function fieldsOf(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Fields : undefined;
}

/** A non-blank string, trimmed; `undefined` otherwise. */
function text(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

/** A finite amount of at least zero (dollars, calls, trials); `undefined` otherwise. */
function amount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function known<T extends string>(table: Record<T, true>, value: unknown): value is T {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value);
}
