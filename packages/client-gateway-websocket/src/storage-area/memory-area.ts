// A storage area that lives as long as the process holding it: the stand-in
// for a client without session storage, which still answers a repeated command
// id but cannot report a command a restarted client lost. Tests share one
// across two "clients" to stand for session storage surviving a restart.

import type { ClientGatewayStorageArea } from "./area.ts";

/** A memory area; every value is copied on the way in, so a caller's later change never reaches it. */
export function clientGatewayMemoryArea(): ClientGatewayStorageArea {
  const items = new Map<string, unknown>();
  return {
    get: async () => Object.fromEntries(items),
    set: async (values) => {
      for (const [key, value] of Object.entries(values)) items.set(key, structuredClone(value));
    },
    remove: async (key) => {
      items.delete(key);
    }
  };
}
