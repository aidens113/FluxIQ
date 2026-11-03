// Test support: a complete `ChatHostStatus`, with only what a test is about overridden.

import type { ChatHostStatus } from "../ports/index.ts";

/**
 * A disconnected, idle status with `fields` applied. The owner key follows the
 * project, so a status for another project is a different owner of the chat;
 * pass `ownerKey` to change owner some other way (another Core).
 */
export function hostStatus(fields: Partial<ChatHostStatus> = {}): ChatHostStatus {
  const projectId = fields.projectId;
  return {
    connected: false,
    ownerKey: JSON.stringify(["gateway-1", "client-1", projectId ?? null]),
    recording: false,
    ...fields
  };
}
