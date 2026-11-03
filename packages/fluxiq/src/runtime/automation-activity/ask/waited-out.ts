import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { emitAutomationStudioActivityClearedWait } from "./cleared-wait.ts";

/**
 * Says, when a tool call's result reports it, that a robot check stood on the
 * page and cleared by itself while the call waited.
 *
 * Core does not own the tool result's field (`clearedWait: { waitedMs }`,
 * written by the caller beside its `resultCode`), so it is read off an unknown
 * result, and only off a tool execution (`kind: "llm_evidence_tool_execution"`).
 * The pair itself, and what a readable `clearedWait` is, belong to
 * `./cleared-wait.ts`; its `ref` here is `waited-out.<callId>`, and `phase` is
 * the phase of the call that met the check.
 */
export function emitAutomationStudioActivityWaitedOut(callId: string, result: unknown, phase: ClientGatewayActivityPhase): void {
  if (!result || typeof result !== "object" || Array.isArray(result)) return;
  const record = result as { kind?: unknown; clearedWait?: unknown };
  if (record.kind !== "llm_evidence_tool_execution") return;
  emitAutomationStudioActivityClearedWait(`waited-out.${callId}`, record.clearedWait, phase);
}
