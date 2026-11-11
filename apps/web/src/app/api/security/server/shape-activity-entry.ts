import type { IamAuditRecord } from "fluxiq/platform";
import type { ActivityEntry } from "../../../../features/security/activity/model";
import { frnScope } from "./frn-scope";

type NameOf = (userId: string) => Promise<string | null>;

const PLATFORM_ACTORS: Readonly<Record<string, string>> = Object.freeze({ "platform-admin": "The platform administrator", "in-process": "FluxIQ" });

async function personLabel(id: string, nameOf: NameOf, fallback: string): Promise<string> {
  return (await nameOf(id)) ?? fallback;
}

async function whoLabel(principal: string, nameOf: NameOf): Promise<string> {
  const platform = Object.hasOwn(PLATFORM_ACTORS, principal) ? PLATFORM_ACTORS[principal] : undefined;
  if (platform !== undefined) return platform;
  const scope = frnScope(principal);
  if (scope.kind === "unknown") return "Unknown";
  if (scope.type === "user") return personLabel(scope.id, nameOf, "Someone no longer in this workspace");
  if (scope.type === "service-identity") return `Service ${scope.id}`;
  return `${scope.type === "role" ? "Role" : scope.type} ${scope.id}`;
}

async function resourceLabel(resource: string, nameOf: NameOf): Promise<string> {
  const scope = frnScope(resource);
  if (scope.kind === "unknown") return "Unknown";
  if (scope.type === "workspace") return "This workspace";
  if (scope.type === "user" || scope.type === "account") return personLabel(scope.id, nameOf, `${scope.type} ${scope.id}`);
  return `${scope.type} ${scope.id}`;
}

/**
 * One audit record as the Activity section shows it, built field by field
 * from an allow-list: when, who (by name), the action, allowed or denied,
 * what it acted on (by name), and, for a list request that hid items, how
 * many it hid (a positive integer, else absent, as on every row written
 * before the count existed). Nothing else of the record is read, so its
 * request id, deciding statement, address prefix, origin, who acted on the
 * person's behalf and how they consented never leave the server.
 */
export async function shapeActivityEntry(record: IamAuditRecord, nameOf: NameOf): Promise<ActivityEntry> {
  const hidden = record.hidden;
  return {
    at: record.time * 1000,
    who: await whoLabel(record.principal, nameOf),
    action: record.action,
    outcome: record.decision === "allow" ? "allowed" : "denied",
    resources: await Promise.all(record.resources.map((resource) => resourceLabel(resource, nameOf))),
    ...(typeof hidden === "number" && Number.isSafeInteger(hidden) && hidden > 0 ? { hidden } : {})
  };
}
