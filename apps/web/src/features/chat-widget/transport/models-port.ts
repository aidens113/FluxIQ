// Whether FluxIQ has an enabled model key, from the Secret Keys program's
// snapshot. Only model capability metadata leaves this file:
// never a name, a scope, metadata or a value.

import type { ChatModelsPort } from "@fluxiq/ui-components";
import { readModelKeyAvailability } from "fluxiq/ui";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatResult } from "./chat-result";

export function createModelsPort(secretKeys: ProgramCommandTransport): ChatModelsPort {
  return {
    async readKeys() {
      const response = await secretKeys.get<{ keys?: unknown }>("snapshot");
      // No list says nothing about the keys: the chat then reads "unknown", not "missing".
      return chatResult(response, (payload) => (Array.isArray(payload?.keys) ? { keys: payload.keys.map(keySummary) } : {}));
    }
  };
}

function keySummary(key: unknown): unknown {
  if (key === null || typeof key !== "object" || Array.isArray(key)) return null;
  const record = key as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind : undefined;
  const provider = typeof record.provider === "string" && record.provider.trim() ? record.provider.trim() : undefined;
  const availability = readModelKeyAvailability(record.availability);
  return {
    ...(kind ? { kind } : {}),
    ...(record.provider !== undefined ? { provider: provider ?? null } : {}),
    enabled: typeof record.enabled === "boolean" ? record.enabled : null,
    ...(record.heldByYou !== undefined ? { heldByYou: typeof record.heldByYou === "boolean" ? record.heldByYou : null } : {}),
    ...(record.availability !== undefined ? { availability } : {}),
    ...(record.availability === undefined && record.unlocked !== undefined ? { unlocked: typeof record.unlocked === "boolean" ? record.unlocked : null } : {})
  };
}
