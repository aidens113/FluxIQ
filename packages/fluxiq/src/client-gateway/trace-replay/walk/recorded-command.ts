// The action command a recorded `server.execute_action` was issued as
// (traces and offline trials, P3), rebuilt so a replay can re-issue it through
// the gateway's own `executeAction` and get the same message back:
//
// - the caller's fields in their recorded order, without the command id the
//   gateway added, the host lease it stamped (re-supplied through the replay's
//   lease source) or the trace stamp (re-stamped by the replay's tap);
// - `metadata` kept where the caller wrote it: the trace stamp replaces or
//   appends it after the command id, so metadata after the command id was the
//   stamp's alone (a caller's own `metadata.trace` is overwritten by the stamp
//   and cannot be recovered);
// - a durable command recognised by its run binding: its correlation owner is
//   a binding whose derived command id is the recorded one.

import { CLIENT_GATEWAY_TRACE_METADATA_KEY, type ClientGatewayActionCommand, type ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import { ClientGatewayCommandLedgerController, isClientGatewayHostLease, type ClientGatewayCommandBinding } from "../../service/index.ts";
import type { ClientGatewayTraceEvent } from "../../trace/index.ts";

/** An id the command ledger accepts in a run binding. */
const LEDGER_ID = /^[A-Za-z0-9._:-]{1,200}$/u;

/** The run binding a durable command is issued under. */
export type ClientGatewayTraceDurableOwner = Pick<ClientGatewayCommandBinding, "projectId" | "runId" | "flowId" | "invocationId" | "attemptId" | "effectOrdinal">;

export type ClientGatewayTraceRecordedCommand = {
  readonly commandId: string;
  readonly command: ClientGatewayActionCommand;
  /** The host lease the original stamped, re-supplied to the replay's lease source; `null` when none. */
  readonly lease: ClientGatewayHostLease | null;
  /** Whether it went out stamped for a trace, so it was issued inside the traced episode. */
  readonly stamped: boolean;
  /** Its run binding when it was a durable command; `null` for an ordinary one. */
  readonly durableOwner: ClientGatewayTraceDurableOwner | null;
};

/** The command, or why the event cannot be re-issued. */
export function readClientGatewayTraceRecordedCommand(event: ClientGatewayTraceEvent): ClientGatewayTraceRecordedCommand | { readonly unreadable: string } {
  const message = event.payload.encoding === "json" ? event.payload.value : null;
  const payload = isRecord(message) ? message.payload : null;
  if (!isRecord(payload) || typeof payload.commandId !== "string") return { unreadable: "the recorded message carries no command" };
  const entries = Object.entries(payload);
  const commandAt = entries.findIndex(([key]) => key === "commandId");
  const fields: Record<string, unknown> = {};
  let lease: ClientGatewayHostLease | null = null;
  let stamped = false;
  for (const [index, [key, value]] of entries.entries()) {
    if (key === "commandId") continue;
    if (key === "lease") {
      if (!isClientGatewayHostLease(value)) return { unreadable: "the recorded host lease is malformed" };
      lease = structuredClone(value);
      continue;
    }
    if (key === "metadata" && isRecord(value) && Object.hasOwn(value, CLIENT_GATEWAY_TRACE_METADATA_KEY)) {
      stamped = true;
      if (index > commandAt) continue;
      fields.metadata = withoutKey(value, CLIENT_GATEWAY_TRACE_METADATA_KEY);
      continue;
    }
    fields[key] = structuredClone(value);
  }
  if (!isActionCommand(fields)) return { unreadable: "the recorded command has no action type" };
  return { commandId: payload.commandId, command: fields, lease, stamped, durableOwner: durableOwner(event.correlation.owner, payload.commandId) };
}

/** `owner` as a run binding when the command id derived from it is `commandId`; otherwise `null`. */
function durableOwner(owner: unknown, commandId: string): ClientGatewayTraceDurableOwner | null {
  if (!isRecord(owner)) return null;
  const { projectId, runId, flowId, invocationId, attemptId, effectOrdinal } = owner;
  if (Object.keys(owner).length !== 6) return null;
  if (typeof projectId !== "string" || typeof runId !== "string" || typeof flowId !== "string") return null;
  if (typeof invocationId !== "string" || typeof attemptId !== "string" || typeof effectOrdinal !== "number") return null;
  // Only an owner the ledger would derive an id from can be a binding (`ClientGatewayCommandLedgerController.commandId`).
  if (![projectId, runId, flowId, invocationId, attemptId].every((id) => LEDGER_ID.test(id))) return null;
  if (!Number.isSafeInteger(effectOrdinal) || effectOrdinal < 0) return null;
  const binding: ClientGatewayTraceDurableOwner = { projectId, runId, flowId, invocationId, attemptId, effectOrdinal };
  return ClientGatewayCommandLedgerController.commandId(binding) === commandId ? binding : null;
}

function withoutKey(value: { readonly [key: string]: unknown }, omitted: string): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (key !== omitted) copy[key] = structuredClone(field);
  }
  return copy;
}

function isActionCommand(value: Record<string, unknown>): value is ClientGatewayActionCommand & Record<string, unknown> {
  return typeof value.actionType === "string";
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
