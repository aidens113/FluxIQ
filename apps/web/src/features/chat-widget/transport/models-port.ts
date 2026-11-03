// Whether FluxIQ has an enabled model key, from the Secret Keys program's
// snapshot. Only each key's kind, provider and enabled flag leave this file:
// never a name, a scope, metadata or a value.

import type { ChatModelsPort } from "@fluxiq/ui-components";
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

function keySummary(key: unknown): { kind?: string; provider?: string; enabled: boolean } {
  const record = (key ?? {}) as Record<string, unknown>;
  const kind = typeof record.kind === "string" && record.kind.trim() ? record.kind.trim() : undefined;
  const provider = typeof record.provider === "string" && record.provider.trim() ? record.provider.trim() : undefined;
  return { ...(kind ? { kind } : {}), ...(provider ? { provider } : {}), enabled: record.enabled === true };
}
