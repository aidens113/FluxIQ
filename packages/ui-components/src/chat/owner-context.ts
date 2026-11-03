import type { ChatHostStatus, ChatTransport } from "./ports/index.ts";
import { leaseTransport } from "./lease-transport.ts";

/** Who the chat belongs to for as long as the owner key holds, with a transport leased to it. */
export type ChatOwner = { readonly token: object; readonly identity: string; current(): boolean; readonly transport: ChatTransport };

/**
 * Observed remote context, separate from volatile connectivity and presentation.
 * The context is the host's `ownerKey`; `initialKey` is the one the chat starts
 * under, so a first status with the same key is not a change of owner.
 */
export function createChatOwnerContext(transport: ChatTransport, initialKey?: string) {
  let key: string | undefined = initialKey;
  let owner = make(key);
  let observed = false;
  function make(ownerKey: string | undefined): ChatOwner {
    const token = {};
    const current = () => owner.token === token;
    return {
      token,
      identity: JSON.stringify([ownerKey]),
      current,
      transport: leaseTransport(transport, current)
    };
  }
  return {
    capture: () => owner,
    observe(status: ChatHostStatus) {
      const changed = status.ownerKey !== key;
      const initial = !observed;
      observed = true;
      if (changed) {
        key = status.ownerKey;
        owner = make(key);
      }
      return { changed, initial };
    }
  };
}
