// Test support for the registry's IAM decisions: the live registrations
// re-registered with stub handlers (so a call is decided exactly as live, and
// an allowed one never reaches storage), payloads, actors and policy sources.

import type { IamPolicySource } from "../../../platform/iam/authorize/index.ts";
import type { IamAuditRecord, IamAuditSink, IamPolicy } from "../../../platform/iam/index.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import { adminRole, viewerRole } from "../../identity-access/index.ts";
import type { Permission } from "../../identity-access/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiEndpointSummary, type ProgramApiHandler, type ProgramApiResponse } from "../api.ts";
import type { ProgramApiIamOptions, ProgramOwnedResourceKind } from "../iam/index.ts";

/** The PIN every fixture payload carries, which `pinAcceptingIdentityAccess` accepts. */
export const FIXTURE_PIN = "123456";

/** Identity Access that accepts any PIN, so a destructive call reaches its stub handler once IAM allows it. */
export const pinAcceptingIdentityAccess = { authorizeSessionPin: async () => ({ authorized: true }) } as unknown as IdentityAccessService;

/** A payload naming no resource: every declared id is missing. */
export const NO_ID_PAYLOAD = Object.freeze({ authSessionId: "fixture-session", authorizationPin: FIXTURE_PIN });

/**
 * A payload in which every id-like field a resource extractor reads (a name
 * ending in `id` or `Id`) holds an id starting with `prefix` (`a-projectId`,
 * `a-flowId`), every other field is a nested payload of the same kind (so
 * `payload.flow.flowId` is `a-flowId`), and the PIN field holds a valid PIN.
 * Arrays are not answered: an extractor that needs one reads a missing id.
 */
export function idsPayload(prefix: string): Record<string, unknown> {
  return new Proxy<Record<string, unknown>>({}, {
    get: (_target, key) => {
      if (typeof key !== "string") return undefined;
      if (key === "authorizationPin") return FIXTURE_PIN;
      if (key === "then" || key === "toJSON") return undefined;
      if (key in Object.prototype) return Reflect.get(Object.prototype, key);
      return /(?:^id|Id)$/u.test(key) ? `${prefix}${key}` : idsPayload(prefix);
    }
  });
}

/** Every live registration again, each with `handler` (by default: success with an empty payload). */
export function stubbedRegistry(endpoints: readonly ProgramApiEndpointSummary[], iam: ProgramApiIamOptions, handlerFor: (endpoint: ProgramApiEndpointSummary) => ProgramApiHandler = () => () => ({ ok: true, payload: {} })): GlobalProgramApiRegistry {
  const registry = new GlobalProgramApiRegistry({ identityAccess: pinAcceptingIdentityAccess, iam });
  for (const endpoint of endpoints) registry.register({ ...endpoint, handler: handlerFor(endpoint) });
  return registry;
}

/** A call's outcome as the gate decided it: refused by IAM, allowed (the stub ran), or anything else (a bug). */
export function outcomeOf(response: ProgramApiResponse): "allow" | "deny" | "error" {
  if (response.ok) return "allow";
  return response.errorCode === "authorization.forbidden" ? "deny" : "error";
}

export function actor(userId: string, roleId: string, permissions: readonly Permission[], channel?: ProgramApiActor["channel"]): ProgramApiActor {
  return { sessionId: `session-${userId}`, userId, roleId, permissions: [...permissions], ...(channel === undefined ? {} : { channel }) };
}

/** The permissions a paired client keeps (apps/web `PAIRED_CLIENT_PERMISSIONS`). */
export const PAIRED_PERMISSIONS: readonly Permission[] = ["programs.read", "programs.write", "runtime.control", "flows.write"];

export const ADMIN_PERMISSIONS: readonly Permission[] = adminRole.permissions;
export const VIEWER_PERMISSIONS: readonly Permission[] = viewerRole.permissions;

/** A policy source that attaches the same identity policies to every principal. */
export function fixedPolicySource(identity: readonly IamPolicy[]): IamPolicySource {
  return {
    resolvePolicySet: async () => ({ identity, guardrails: [], sessions: [], boundary: null }),
    getRole: async () => null
  };
}

/** A sink that keeps every record (tests only: it is unbounded). */
export function recordingSink(): IamAuditSink & { records: IamAuditRecord[] } {
  const records: IamAuditRecord[] = [];
  return { records, record: (record) => void records.push(record), flush: async () => undefined };
}

/** Registers, for every owned kind, a resolver: an id starting `a-` is alice's, `b-` bob's, anything else unowned. */
export function registerPrefixOwners(registry: GlobalProgramApiRegistry, recorded: Array<{ kind: string; id: string; userId: string }> = []): void {
  const kinds: ProgramOwnedResourceKind[] = ["project", "schedule", "key", "client"];
  for (const kind of kinds) {
    registry.registerResourceOwners(kind, {
      ownerOf: async (id) => (id.startsWith("a-") ? "alice" : id.startsWith("b-") ? "bob" : null),
      recordOwner: async (id, userId) => void recorded.push({ kind, id, userId })
    });
  }
}
