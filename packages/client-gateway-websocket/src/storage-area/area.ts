// The key-value storage a client keeps its session-long ledgers in: in a
// browser, its session storage, which survives the background worker that
// wrote it and is forgotten when the browser closes; anywhere else, whatever
// keeps values for the life of the client. The ledgers that use it
// (`../reconcile/`, `../host-lease/`) keep one key per entry under their own
// prefix, so two entries are never read and rewritten together.

/** A key-value area: every item, set some items, remove one key. */
export type ClientGatewayStorageArea = {
  get(keys: null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};
