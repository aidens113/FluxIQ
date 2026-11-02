import type { AutomationStudioFaultAssessment, AutomationStudioFaultEffect } from "./contracts.ts";
import { automationStudioRetryHintMs } from "./retry-hint.ts";
import { automationStudioTransientStatusEffect } from "./transient-status.ts";

/**
 * Transport-level codes the runtime retries, and whether the request behind each
 * could already have been carried out.
 *
 * A connection that was refused, a name that did not resolve, a route that did
 * not exist and a connect attempt that timed out all failed before anything could
 * accept the request, so repeating one is safe however consequential the node is.
 * A connection reset, a broken pipe, a read that timed out and a connection closed
 * mid-answer all happened after the request went out, so the work may have been
 * done and only the answer lost.
 */
const TRANSPORT_CODE_EFFECTS: ReadonlyMap<string, AutomationStudioFaultEffect> = new Map<string, AutomationStudioFaultEffect>([
  ["ECONNREFUSED", "unacted"],
  ["ENOTFOUND", "unacted"],
  ["EAI_AGAIN", "unacted"],
  ["ENETUNREACH", "unacted"],
  ["EHOSTUNREACH", "unacted"],
  ["UND_ERR_CONNECT_TIMEOUT", "unacted"],
  ["ECONNRESET", "ambiguous"],
  ["ETIMEDOUT", "ambiguous"],
  ["EPIPE", "ambiguous"],
  ["ENETRESET", "ambiguous"],
  ["UND_ERR_HEADERS_TIMEOUT", "ambiguous"],
  ["UND_ERR_BODY_TIMEOUT", "ambiguous"],
  ["UND_ERR_SOCKET", "ambiguous"],
  ["ERR_SOCKET_CONNECTION_CLOSED", "ambiguous"]
]);

/** Error type names that state a transient fault on their own, read the same unacted/ambiguous way. */
const ERROR_NAME_EFFECTS: ReadonlyMap<string, AutomationStudioFaultEffect> = new Map<string, AutomationStudioFaultEffect>([
  ["AbortError", "ambiguous"],
  ["TimeoutError", "ambiguous"],
  ["NetworkError", "ambiguous"],
  ["FetchError", "ambiguous"],
  ["ConnectTimeoutError", "unacted"]
]);

/** Phrases that state a transient transport fault where no code or status survived the throw. */
const TRANSIENT_PHRASES: readonly string[] = Object.freeze([
  "fetch failed",
  "socket hang up",
  "network error",
  "connection closed",
  "connection reset",
  "temporarily unavailable",
  "temporary failure",
  "timed out",
  "timeout",
  "too many requests",
  "rate limit",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  "try again"
]);

/** How deep a `cause` chain is followed: deep enough for a wrapped transport fault, shallow enough to be bounded. */
const MAXIMUM_CAUSE_DEPTH = 4;

/**
 * One thrown value, classified.
 *
 * Every node dispatch is wrapped, so a node that throws -- a built-in, a domain's
 * output, a host-executed one, one written tomorrow -- produces a classified
 * fault rather than a bare message. Until this existed a throw became a failed
 * attempt with no structured record at all, and the retry loop, which asks the
 * record whether the attempt may be repeated, answered no every time. That is how
 * a run ended on a 503.
 *
 * `aborted` is the run's own cancellation, checked by the caller at the moment of
 * the throw. An abort raised while the run was being cancelled -- by the person,
 * or by a region running out of time -- is refused: the deadline it passed will
 * not come back, and attempting again inside it spends time already spent.
 */
export function automationStudioFaultFromThrownError(error: unknown, context: { now: number; aborted: boolean }): AutomationStudioFaultAssessment {
  const hintedWaitMs = automationStudioRetryHintMs(error, context.now);
  const status = thrownStatus(error, 0);
  const statusEffect = automationStudioTransientStatusEffect(status);
  const withStatus = status === undefined ? {} : { httpStatus: status };
  const withHint = hintedWaitMs === undefined ? {} : { hintedWaitMs };
  if (context.aborted) {
    return {
      disposition: "refuse",
      category: "timeout",
      code: "executor.fault.cancelled",
      source: "thrown_error",
      effect: "ambiguous",
      reason: "The run was already being cancelled when the node threw, so the deadline it passed will not come back.",
      ...withStatus
    };
  }
  if (statusEffect) {
    return {
      disposition: "retry",
      category: status === 429 ? "timeout" : "action_failed",
      code: `executor.fault.status.${status}`,
      source: "thrown_error",
      effect: statusEffect,
      reason: `The node threw with transport status ${status}, which states the request was not answered usefully and may be repeated.`,
      ...withStatus,
      ...withHint
    };
  }
  const transport = thrownTransportEffect(error, 0);
  if (transport) {
    return {
      disposition: "retry",
      category: transport.category,
      code: `executor.fault.transport.${transport.key.toLowerCase()}`,
      source: "thrown_error",
      effect: transport.effect,
      reason: `The node threw ${transport.key}, a transport fault that says nothing about the request being wrong.`,
      ...withStatus,
      ...withHint
    };
  }
  if (malformedAnswer(error, 0)) {
    return {
      disposition: "retry",
      category: "ambiguous_or_unknown",
      code: "executor.fault.malformed_answer",
      source: "thrown_error",
      effect: "ambiguous",
      reason: "The node threw while reading an answer it could not parse, which a truncated or half-written answer produces and a second read often does not.",
      ...withStatus,
      ...withHint
    };
  }
  if (transientPhrase(error, 0)) {
    return {
      disposition: "retry",
      category: "timeout",
      code: "executor.fault.transient_text",
      source: "thrown_error",
      effect: "ambiguous",
      reason: "The node threw with text stating a transient fault, though it carried no code or status to classify from.",
      ...withStatus,
      ...withHint
    };
  }
  return {
    disposition: "refuse",
    category: "ambiguous_or_unknown",
    code: "executor.fault.unclassified",
    source: "thrown_error",
    effect: "ambiguous",
    reason: "The node threw for a reason that states nothing transient, so attempting it again would spend the time of the run to be told the same thing.",
    ...withStatus
  };
}

/** The transport status carried on the thrown value, its answer, or its cause chain, or stated in its text. */
function thrownStatus(error: unknown, depth: number): number | undefined {
  if (depth > MAXIMUM_CAUSE_DEPTH || typeof error !== "object" || error === null) return statusFromText(errorText(error));
  const record = error as Record<string, unknown>;
  for (const candidate of [record.status, record.statusCode, readProperty(record.response, "status"), readProperty(record.response, "statusCode")]) {
    if (typeof candidate === "number" && Number.isInteger(candidate)) return candidate;
  }
  const fromText = statusFromText(errorText(error));
  if (fromText !== undefined) return fromText;
  return record.cause === undefined ? undefined : thrownStatus(record.cause, depth + 1);
}

/**
 * A status stated in the text of the thrown value.
 *
 * It has to be stated as a status. A bare three-digit number is as likely to be a
 * row count as a transport code, and reading "500 rows returned" as a server
 * fault would turn a deterministic answer into three attempts. Either the number
 * follows a word that names it, or it is followed by its own standard phrase.
 */
function statusFromText(text: string): number | undefined {
  const named = /(?:status|code|http)\D{0,12}?(\d{3})\b/iu.exec(text);
  if (named) return Number(named[1]);
  const phrased = /\b(\d{3})\s+(?:too many requests|service unavailable|bad gateway|gateway time-?out|internal server error|request time-?out)/iu.exec(text);
  return phrased ? Number(phrased[1]) : undefined;
}

function thrownTransportEffect(error: unknown, depth: number): { key: string; effect: AutomationStudioFaultEffect; category: "timeout" | "action_failed" } | undefined {
  if (depth > MAXIMUM_CAUSE_DEPTH) return undefined;
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : undefined;
  const code = typeof record?.code === "string" ? record.code.toUpperCase() : undefined;
  const codeEffect = code === undefined ? undefined : TRANSPORT_CODE_EFFECTS.get(code);
  if (code !== undefined && codeEffect) return { key: code, effect: codeEffect, category: code.includes("TIMEOUT") ? "timeout" : "action_failed" };
  const name = typeof record?.name === "string" ? record.name : undefined;
  const nameEffect = name === undefined ? undefined : ERROR_NAME_EFFECTS.get(name);
  if (name !== undefined && nameEffect) return { key: name, effect: nameEffect, category: name === "AbortError" || name.includes("Timeout") ? "timeout" : "action_failed" };
  const upperText = errorText(error).toUpperCase();
  for (const [candidate, effect] of TRANSPORT_CODE_EFFECTS) {
    if (upperText.includes(candidate)) return { key: candidate, effect, category: candidate.includes("TIMEOUT") ? "timeout" : "action_failed" };
  }
  return record?.cause === undefined ? undefined : thrownTransportEffect(record.cause, depth + 1);
}

/** A parse failure over an answer, which a truncated or half-written answer produces. */
function malformedAnswer(error: unknown, depth: number): boolean {
  if (depth > MAXIMUM_CAUSE_DEPTH) return false;
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : undefined;
  const name = typeof record?.name === "string" ? record.name : undefined;
  const text = errorText(error).toLowerCase();
  const parseText = text.includes("json") || text.includes("unexpected end of input") || text.includes("unexpected token");
  if (name === "SyntaxError" && parseText) return true;
  if (text.includes("unexpected end of json") || text.includes("invalid json")) return true;
  return record?.cause === undefined ? false : malformedAnswer(record.cause, depth + 1);
}

function transientPhrase(error: unknown, depth: number): boolean {
  if (depth > MAXIMUM_CAUSE_DEPTH) return false;
  const text = errorText(error).toLowerCase();
  if (TRANSIENT_PHRASES.some((phrase) => text.includes(phrase))) return true;
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : undefined;
  return record?.cause === undefined ? false : transientPhrase(record.cause, depth + 1);
}

/** The message the thrown value carries, or the value itself where it is not an error. */
export function automationStudioThrownErrorText(error: unknown): string {
  return errorText(error);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return typeof error === "number" || typeof error === "boolean" ? String(error) : "";
}

function readProperty(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}
