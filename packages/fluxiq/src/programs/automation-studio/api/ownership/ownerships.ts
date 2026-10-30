import path from "node:path";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import type { AutomationStudioService } from "../../runtime/index.ts";
import { AutomationStudioGatewayTraceServicePools } from "../../runtime/gateway-trace/wiring/index.ts";
import { AutomationStudioProjectOwnerDocumentStore } from "./document-store.ts";
import { AutomationStudioProjectOwnerMemoryStore } from "./memory-store.ts";
import { AutomationStudioProjectOwnership } from "./ownership.ts";
import { automationStudioServiceProjectCatalog } from "./service-catalog.ts";

// One project ownership per Automation Studio service, made where the API is
// registered and found again by the service (the project handlers read it to
// add `ownerUserId`). Held weakly, like the service's pool.
//
// Where it is kept: the service keeps its storage root private and its file is
// frozen, but it hands its per-project database pool to
// `AutomationStudioGatewayTraceServicePools` as it creates it, and the pool's
// `rootDir` is the service's Automation Studio data directory. The records are
// one program-state document there, `ownership/projects.json` (a SQLite row of
// the storage owner under layout v2), beside `projects/` and never inside a
// project's own directory or database, which the runtime owns. A service built
// without storage has no pool and keeps its projects in memory; its owners are
// kept in memory too.

const ownerships = new WeakMap<object, AutomationStudioProjectOwnership>();

export const AutomationStudioProjectOwnerships = Object.freeze({
  /**
   * Makes `service`'s project ownership and remembers it. The default owner is
   * read from `identityAccess`; without one there is no default owner, so a
   * project stays ownerless until its creator is recorded.
   */
  create(service: AutomationStudioService, identityAccess: IdentityAccessService | undefined): AutomationStudioProjectOwnership {
    const ownership = new AutomationStudioProjectOwnership({
      store: AutomationStudioProjectOwnerships.storeFor(service),
      catalog: automationStudioServiceProjectCatalog(service),
      defaults: { users: async () => (identityAccess ? (await identityAccess.snapshot()).users : []) }
    });
    ownerships.set(service, ownership);
    return ownership;
  },

  /** The ownership `create` made for `service`, or nothing when its API was never registered. */
  of(service: AutomationStudioService): AutomationStudioProjectOwnership | undefined {
    return ownerships.get(service);
  },

  /** The durable document under the service's data directory, or memory for a service without storage. */
  storeFor(service: AutomationStudioService): AutomationStudioProjectOwnerDocumentStore | AutomationStudioProjectOwnerMemoryStore {
    const pool = AutomationStudioGatewayTraceServicePools.of(service);
    return pool ? new AutomationStudioProjectOwnerDocumentStore(path.join(pool.rootDir, "ownership", "projects.json")) : new AutomationStudioProjectOwnerMemoryStore();
  }
});
