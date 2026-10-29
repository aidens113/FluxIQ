import { iamActionCatalogSchema, iamActionName, type IamActionCatalogEntry } from "@fluxiq/contracts/iam";
import { iamEndpointAccessLevel } from "./endpoint-access-level.ts";
import type { IamCatalogGeneration } from "./catalog-generation.ts";
import type { IamEndpointRegistration } from "./endpoint-registration.ts";
import { IamCatalogSourceLimitError } from "./catalog-source-limit-error.ts";
import { iamProgramService } from "./program-service.ts";

const MAX_SOURCES = 16;
const DESTRUCTIVE_CLASSIFICATIONS: ReadonlySet<string> = new Set(["destructive", "program-gated"]);

function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Generates the IAM action catalog from the program API registrations. Several
 * endpoints with the same action merge into one entry listing every
 * registration as a source (ordered by programId, then endpoint) when their access level and destructive flag agree, otherwise it
 * throws. The result is validated with `iamActionCatalogSchema`.
 */
export function generateIamActionCatalog(endpoints: readonly IamEndpointRegistration[]): IamCatalogGeneration {
  const groups = new Map<string, IamEndpointRegistration[]>();
  for (const registration of endpoints) {
    const action = iamActionName(iamProgramService(registration.programId), registration.endpoint);
    const group = groups.get(action) ?? [];
    group.push(registration);
    groups.set(action, group);
  }
  const catalog: IamActionCatalogEntry[] = [];
  const sharedActions: IamCatalogGeneration["sharedActions"] = [];
  const undeclaredResources: string[] = [];
  for (const [action, group] of [...groups.entries()].sort(([a], [b]) => compare(a, b))) {
    const sorted = [...group].sort((a, b) => compare(a.programId, b.programId) || compare(a.endpoint, b.endpoint));
    if (sorted.length > MAX_SOURCES) throw new IamCatalogSourceLimitError(action, sorted.length, MAX_SOURCES);
    const first = sorted[0];
    if (first === undefined) continue;
    const levels = new Set(sorted.map((item) => iamEndpointAccessLevel(action, item.endpoint, item.classification)));
    const flags = new Set(sorted.map((item) => DESTRUCTIVE_CLASSIFICATIONS.has(item.classification)));
    if (levels.size > 1 || flags.size > 1) {
      const detail = sorted.map((item) => `${item.programId}(${item.classification})`).join(", ");
      throw new Error(`Action ${action} is shared by endpoints that disagree on access level or destructive: ${detail}`);
    }
    const accessLevel = iamEndpointAccessLevel(action, first.endpoint, first.classification);
    const isOps = action.startsWith("ops:");
    if (!isOps) undeclaredResources.push(action);
    if (sorted.length > 1) sharedActions.push({ action, sources: sorted.map((item) => item.programId) });
    const others = sorted.length > 1 ? ` and ${sorted.length - 1} other program${sorted.length > 2 ? "s" : ""}` : "";
    catalog.push({
      action,
      accessLevel,
      resourceTypes: isOps ? ["program"] : ["*"],
      sources: sorted.map((item) => ({ kind: "endpoint" as const, programId: item.programId, endpoint: item.endpoint })),
      destructive: DESTRUCTIVE_CLASSIFICATIONS.has(first.classification),
      description: `Calls the ${first.endpoint} endpoint of the ${first.programId} program${others} (${accessLevel} access).`
    });
  }
  const parsed = iamActionCatalogSchema.safeParse(catalog);
  if (!parsed.success) throw new Error(`Generated IAM action catalog is invalid: ${parsed.error.message}`);
  return { catalog: parsed.data, sharedActions, undeclaredResources };
}
