// The per-project database pool each Automation Studio service opened, for
// the host that builds the trace episodes over it (D10), and where that
// service's project content protection is read. The service keeps both private
// and its file is frozen (`.structure-baseline.json`), so it hands the pool
// over here as it creates it, in the one expression that creates it, with a
// reader of its protection, and the host asks for the pool by the service.
// Held weakly: a service nobody holds takes its entry with it. One project
// never gets a second connection, because the traces use the very pool the
// service uses.
//
// The protection is read, not copied: the framework binds the host's
// protection after the service is built (`bindReusableLlmContext`), and every
// trace store opened from then on seals with it (lane T P3-E2).

import type { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
import type { AutomationStudioGatewayTraceProtectionSource } from "./types.ts";

const pools = new WeakMap<object, AutomationStudioProjectDatabasePool>();
const protections = new WeakMap<AutomationStudioProjectDatabasePool, AutomationStudioGatewayTraceProtectionSource>();

export const AutomationStudioGatewayTraceServicePools = Object.freeze({
  /**
   * Remembers `pool` as `owner`'s, and `protection` as where its content
   * protection is read, and answers `pool` unchanged, so it can wrap the
   * expression that creates it.
   */
  adopt(owner: object, pool: AutomationStudioProjectDatabasePool, protection: AutomationStudioGatewayTraceProtectionSource): AutomationStudioProjectDatabasePool {
    pools.set(owner, pool);
    protections.set(pool, protection);
    return pool;
  },
  /** The pool `owner` adopted, or nothing for a service without project storage. */
  of(owner: object): AutomationStudioProjectDatabasePool | undefined {
    return pools.get(owner);
  },
  /**
   * Where the protection of the service that adopted `pool` is read. A pool no
   * service adopted throws: whether its traces must be sealed is unknown, and
   * storing them unsealed on that guess is not an answer.
   */
  protectionOf(pool: AutomationStudioProjectDatabasePool): AutomationStudioGatewayTraceProtectionSource {
    const protection = protections.get(pool);
    if (protection === undefined) throw new Error("gateway trace pool was adopted by no service, so its content protection is unknown");
    return protection;
  }
});
