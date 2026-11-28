// The panel's chat in a project keeps the page and selection each message was written on with that message
// (Core's `panel.on-screen` attachment on the person's turn), so when the message is handed to the panel
// assistant its work, and any Allow pressed later, is judged by what was selected when it was said. The
// reference is base64url JSON of the chat's `onScreen`, within the conversation store's reference limit:
// a selection too long to keep whole keeps its page and named ids and leaves out its step and node lists.

import type { ChatOnScreen } from "@fluxiq/ui-components";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";

/** The person-turn attachment kind Core reads the page and selection from (`runtime/conversations/assistant/context/on-screen-attachment.ts`). */
export const PANEL_ON_SCREEN_ATTACHMENT = "panel.on-screen";

/** The longest reference Core keeps on a turn (`runtime/conversations/inputs.ts`). */
const REFERENCE_MAX = 1_000;

/** `api`, with every message it posts (`append-turn`) carrying what `onScreen` says is open now. */
export function withOnScreen(api: ProgramCommandTransport, onScreen: () => ChatOnScreen): ProgramCommandTransport {
  return {
    get: (endpoint, options) => api.get(endpoint, options),
    post(endpoint, payload, options) {
      if (endpoint !== "append-turn") return api.post(endpoint, payload, options);
      const ref = reference(onScreen());
      return api.post(endpoint, ref === undefined ? payload : { ...payload, attachmentKind: PANEL_ON_SCREEN_ATTACHMENT, attachmentRef: ref }, options);
    }
  };
}

function reference(onScreen: ChatOnScreen): string | undefined {
  const whole = encode(onScreen);
  if (whole.length <= REFERENCE_MAX) return whole;
  const { stepNumbers: _steps, nodeIds: _nodes, ...named } = (onScreen.selection ?? {}) as Record<string, unknown>;
  const shorter = encode({ ...onScreen, selection: named });
  return shorter.length <= REFERENCE_MAX ? shorter : undefined;
}

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}
