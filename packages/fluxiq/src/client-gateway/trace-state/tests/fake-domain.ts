// A small domain for the state rule's tests, shaped unlike any web site: a warehouse
// robot that scans shelves, moves between aisles and picks parts. An answer is
// `{ status, at, rows, timedOut }`. It shows Core needs no selector, URL or page.

import { readClientGatewayTraceOperation, type ClientGatewayTraceOperation, type ClientGatewayTraceRecordedPayload } from "../../trace-matcher/index.ts";
import type { ClientGatewayTraceStateDomain, ClientGatewayTraceStateRecordedCall } from "../types.ts";

const KINDS: Readonly<Record<string, "read" | "page_move" | "act">> = { scan: "read", goto: "page_move", next_shelf: "page_move", pick: "act", press: "act" };

export const fakeDomain: ClientGatewayTraceStateDomain = {
  normalisations: [{ id: "wait", why: "a wait is rule 7" }],
  labelCall: (operation) => KINDS[operation.actionType] ?? "act",
  pageMoveForm: (operation) => (operation.actionType === "goto" ? "absolute" : "relative"),
  canonicalKey: (operation) => JSON.stringify({ a: operation.actionType, p: withoutWait(operation) }),
  siblingKey: (operation) => JSON.stringify({ a: operation.actionType, p: { ...withoutWait(operation), bin: null } }),
  waitMs: (operation) => {
    const { waitMs } = (operation.compared.parameters ?? {}) as { readonly waitMs?: number };
    return waitMs ?? null;
  },
  readAnswer: (answer) => ({
    outcome: answer === null || answer.status === "failed" ? "failed" : answer.status === "unchanged" ? "no_effect" : "succeeded",
    position: typeof answer?.at === "string" ? answer.at : null,
    rows: Array.isArray(answer?.rows) ? (answer.rows as readonly string[]) : null,
    timedOut: answer?.timedOut === true
  }),
  isOneTimeLayerAct: (operation, readBefore) => (operation.compared.parameters as { readonly part?: string } | null)?.part === "cover" && readBefore !== null
};

function withoutWait(operation: ClientGatewayTraceOperation): Record<string, unknown> {
  const { waitMs: _waitMs, ...rest } = (operation.compared.parameters ?? {}) as Record<string, unknown>;
  return rest;
}

export function operation(actionType: string, parameters: Record<string, unknown> = {}): ClientGatewayTraceOperation {
  return readClientGatewayTraceOperation({ actionType, parameters });
}

/** A recorded call: its command and the answer the trace holds for it. */
export function recorded(ordinal: number, actionType: string, parameters: Record<string, unknown>, answer: ClientGatewayTraceRecordedPayload | null, extra: Partial<ClientGatewayTraceStateRecordedCall> = {}): ClientGatewayTraceStateRecordedCall {
  return { ordinal, sequence: ordinal * 2 + 1, operation: operation(actionType, parameters), callId: null, answer, latencyMs: 10, redacted: false, ...extra };
}

/** Builds calls from short forms, numbering them in order. */
export function calls(...items: readonly (readonly [string, Record<string, unknown>, ClientGatewayTraceRecordedPayload | null])[]): readonly ClientGatewayTraceStateRecordedCall[] {
  return items.map(([actionType, parameters, answer], ordinal) => recorded(ordinal, actionType, parameters, answer));
}
