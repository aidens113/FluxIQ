// Whether FluxIQ has a model key it may use, read once when the latest chat
// opens empty, so a person learns before typing a request that FluxIQ cannot
// build yet. It asks the transport's `models.readKeys`, which answers
// `{ ok, value: { keys: [{ kind?, provider?, enabled }] } }` from
// Core's `secret-keys snapshot` and never a key's value. No DOM.
//
//   ready    at least one key is enabled and usable here
//   locked:* the person's own key is enabled, and this browser cannot open it;
//            Core says so per key, and why, which is the words they read
//   missing  the transport answered and no key is enabled (none, or all disabled)
//   unknown  the read failed, answered a shape it does not promise, or the
//            client has no `models` port; the chat then says nothing, rather
//            than claim a key is missing

import { readModelKeyLockReason, type ModelKeyLockReason } from "fluxiq/ui";
import type { ChatModelsPort } from "../ports/index.ts";

/** What the chat knows about the model keys. */
export type ModelReadiness = "ready" | `locked:${ModelKeyLockReason}` | "missing" | "unknown";

/** Why a `locked:*` reading is locked; null for any other. */
export function modelReadinessLockReason(readiness: ModelReadiness): ModelKeyLockReason | null {
  return readiness.startsWith("locked:") ? readiness.slice("locked:".length) as ModelKeyLockReason : null;
}

/** Asks the client through `models`; never throws. Without a `models` port the answer is always `unknown`. */
export async function readModelReadiness(models: ChatModelsPort | undefined): Promise<ModelReadiness> {
  if (models === undefined) {
    return "unknown";
  }
  try {
    const result = await models.readKeys();
    if (!result.ok) {
      return "unknown";
    }
    const keys = result.value.keys;
    if (!Array.isArray(keys)) {
      return "unknown";
    }
    const enabled = keys.map(record).filter((key) => key?.enabled === true);
    if (enabled.length === 0) {
      return "missing";
    }
    // A key that says nothing about being unlocked (an older Core, or someone else's) is ready as it always was.
    return enabled.every((key) => key?.unlocked === false) ? `locked:${readModelKeyLockReason(enabled[0]?.lockedBecause)}` : "ready";
  } catch {
    return "unknown";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
