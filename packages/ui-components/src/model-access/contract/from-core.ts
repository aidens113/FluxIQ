// Core's model-access state as one of the card's seven states. A missing or unreadable state (`null`) means this
// FluxIQ is older than the contract, so the person is told to update it. "Not permitted" has no state of its
// own: it looks like "no key", with Core's sentence and an action to add one's own key.

import type { ModelAccessState } from "../state.ts";
import type { CoreModelAccess } from "./core-model-access.ts";

const PROVIDER_NAMES: Readonly<Record<string, string>> = { anthropic: "Anthropic", deepseek: "DeepSeek" };
const UNKNOWN_PROVIDER = "your AI provider";
const UNKNOWN_KEY = "your key";

/** The card state for Core's `access`; `null` (absent or unreadable) reads as an old FluxIQ. */
export function modelAccessFromCore(access: CoreModelAccess | null | undefined): ModelAccessState {
  if (!access) return { kind: "update-fluxiq" };
  const provider = access.key ? PROVIDER_NAMES[access.key.provider] ?? access.key.provider : UNKNOWN_PROVIDER;
  const keyName = access.key?.name.trim() || UNKNOWN_KEY;
  const message = access.message.trim() || undefined;
  switch (access.status) {
    case "ready": {
      const answered = access.lastCall?.outcome === "answered" ? access.lastCall.atMs : undefined;
      return answered === undefined ? { kind: "ready", provider, keyName } : { kind: "ready", provider, keyName, lastAnsweredAtMs: answered };
    }
    case "no_key":
      return { kind: "no-key" };
    case "key_unopenable":
      return message ? { kind: "cant-open", keyName, message } : { kind: "cant-open", keyName };
    case "not_permitted":
      return message ? { kind: "no-key", message, actionLabel: "Add your own key" } : { kind: "no-key", actionLabel: "Add your own key" };
    case "provider_refused":
      return { kind: "not-accepted", provider, keyName };
    case "no_credit":
      return { kind: "no-credit", provider, keyName };
    case "provider_unreachable":
      return { kind: "unreachable", provider };
    default:
      return { kind: "update-fluxiq" };
  }
}
