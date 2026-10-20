import type { ClientGatewayOutboxState, ClientGatewayOutboxStore } from "./types.ts";

/**
 * An outbox store that lives as long as the process holding it. The state and
 * its entry list are copied on write and on read, so neither the writer nor a
 * reader can add, remove or reorder what is kept behind the outbox's back.
 * Entries themselves are shared: a queued message is never changed in place.
 */
export function clientGatewayMemoryOutboxStore(): ClientGatewayOutboxStore {
  let state: ClientGatewayOutboxState = { entries: [] };
  return {
    async read() {
      return copy(state);
    },
    async write(next) {
      state = copy(next);
    }
  };
}

function copy(state: ClientGatewayOutboxState): ClientGatewayOutboxState {
  return { ...state, entries: [...state.entries] };
}
