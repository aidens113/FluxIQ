// The per-project database pool each Automation Studio service opened, for
// the host that builds the trace episodes over it (D10). The service keeps the
// pool private and its file is frozen (`.structure-baseline.json`), so it
// hands the pool over here as it creates it, in the one expression that
// creates it, and the host asks for it by the service. Held weakly: a service
// nobody holds takes its entry with it. One project never gets a second
// connection, because the traces use the very pool the service uses.

import type { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";

const pools = new WeakMap<object, AutomationStudioProjectDatabasePool>();

export const AutomationStudioGatewayTraceServicePools = Object.freeze({
  /** Remembers `pool` as `owner`'s and answers it unchanged, so it can wrap the expression that creates it. */
  adopt(owner: object, pool: AutomationStudioProjectDatabasePool): AutomationStudioProjectDatabasePool {
    pools.set(owner, pool);
    return pool;
  },
  /** The pool `owner` adopted, or nothing for a service without project storage. */
  of(owner: object): AutomationStudioProjectDatabasePool | undefined {
    return pools.get(owner);
  }
});
