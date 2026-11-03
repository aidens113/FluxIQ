import type { ChatOwner } from "../owner-context.ts";
import { leaseTransport } from "../lease-transport.ts";

/** Keeps composer ownership aligned with selected chat scope, retaining remote lease validity. */
export function createProjectDraftOwner(): { capture(remote: ChatOwner, projectId: string | undefined, remoteProjectId?: string): ChatOwner } {
  let lastRemote: ChatOwner | undefined;
  let lastProject: string | undefined;
  let current: ChatOwner | undefined;
  return {
    capture(remote, projectId, remoteProjectId) {
      if (projectId !== undefined && projectId === remoteProjectId) {
        projectId = undefined;
      }
      if (current !== undefined && lastRemote?.token === remote.token && lastProject === projectId) {
        return current;
      }
      lastRemote = remote;
      lastProject = projectId;
      if (projectId === undefined) {
        current = remote;
        return current;
      }
      const token = {};
      const valid = () => current?.token === token && remote.current();
      current = {
        token,
        identity: JSON.stringify([remote.identity, "chat-project", projectId]),
        current: valid,
        transport: leaseTransport(remote.transport, valid)
      };
      return current;
    }
  };
}
