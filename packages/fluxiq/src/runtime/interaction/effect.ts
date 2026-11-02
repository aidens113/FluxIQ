import type { JsonValue } from "../../core/index.ts";
import type { AutomationStudioAskDraft } from "./request.ts";

/**
 * The effect anything executing inside a run emits to ask the person something.
 *
 * An effect rather than a field on the node result, so the capability is open
 * to every part of a run at once: a built-in node, a domain adapter answering a
 * dispatch, a permission gate. The executor reads it where it reads the rest of
 * an attempt's effects, and never hands it to a host dispatcher -- no domain is
 * asked to know what an ask is.
 */
export const AUTOMATION_STUDIO_ASK_EFFECT = "ask.requested";

/** The effect for a drafted ask, ready to return from a node's `effects`. */
export function automationStudioAskEffect(draft: AutomationStudioAskDraft): { type: string; payload: JsonValue } {
  return { type: AUTOMATION_STUDIO_ASK_EFFECT, payload: draft as unknown as JsonValue };
}
