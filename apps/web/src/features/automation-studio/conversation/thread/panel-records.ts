// The two kinds of turn attachment that record the panel operating itself.
//
// `panel-capability` is written by Core on a confirmation it raised before a
// delete or a payment: the reference is the invocation Core resolved, as
// base64url JSON, so the panel that sees the confirmation granted runs exactly
// that and nothing it would have to reconstruct. The project is left out of it
// because the thread already belongs to one.
//
// `panel-capability-result` is written by the panel after running a
// capability, on the person's behalf, so Core reads the turn back to the model
// as the panel speaking rather than the person.
//
// Neither is anything to draw: the turn's own words already say what happened,
// and a reference box under them would only show an encoded string.

import type { ConversationTurn } from "./contracts";

export const CONVERSATION_PANEL_CAPABILITY_ATTACHMENT = "panel-capability";
export const CONVERSATION_PANEL_RESULT_ATTACHMENT = "panel-capability-result";

/** A capability the thread says to run, as Core resolved it. */
export type ConversationPanelInvocation = {
  capabilityId: string;
  arguments: Record<string, unknown>;
};

/** Whether this attachment is the panel's own record rather than something to show. */
export function conversationAttachmentIsPanelRecord(kind: string): boolean {
  return kind === CONVERSATION_PANEL_CAPABILITY_ATTACHMENT || kind === CONVERSATION_PANEL_RESULT_ATTACHMENT;
}

/**
 * The invocation a confirmation turn carries, or null when the turn carries
 * none or its reference cannot be read. Null is not a silent refusal: the
 * caller says in the thread that there was nothing it could run.
 */
export function conversationPanelInvocation(turn: ConversationTurn | undefined): ConversationPanelInvocation | null {
  const attachment = turn?.attachment;
  if (!attachment || attachment.kind !== CONVERSATION_PANEL_CAPABILITY_ATTACHMENT) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(attachment.ref));
  } catch (error) {
    // A reference that is not JSON is Core's defect, not the person's, and
    // there is nothing in it to run. Kept as the reason on the way out.
    parsed = { unreadable: String(error) };
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.capabilityId !== "string" || !record.capabilityId) return null;
  const args = record.arguments && typeof record.arguments === "object" && !Array.isArray(record.arguments)
    ? (record.arguments as Record<string, unknown>)
    : {};
  return { capabilityId: record.capabilityId, arguments: args };
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}
