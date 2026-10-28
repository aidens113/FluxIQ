import type { IamService } from "../service.ts";

/**
 * A FluxIQ Resource Name, parsed:
 * `frn:fluxiq:<service>:<workspaceId>:<resourceType>/<resourceId>`.
 *
 * `workspaceId` is null where the segment is empty (`frn:fluxiq:platform::account/<id>`,
 * `frn:fluxiq:iam::service-identity/<name>`). `resourceId` is everything after
 * the first `/` and may itself hold `/`-separated child pairs
 * (`project/<id>/flow/<id>` has `resourceType` `project` and `resourceId`
 * `<id>/flow/<id>`).
 */
export type FluxIQResourceName = {
  service: IamService;
  workspaceId: string | null;
  resourceType: string;
  resourceId: string;
};

/** Every FRN starts with this. */
export const FRN_PREFIX = "frn:fluxiq:";

/** The longest FRN, in characters. */
export const FRN_MAX_LENGTH = 1024;

/**
 * One identifier segment (a workspace id, a resource id, a child id): 1 to 128
 * of letters, digits and `._~@+=,-`. No `:`, `/`, wildcard or `$`, so an
 * identifier can never read as structure, a pattern or a policy variable.
 */
export const FRN_SEGMENT_PATTERN = /^[A-Za-z0-9._~@+=,-]{1,128}$/u;

/**
 * Whether a service's FRNs carry a workspace segment: `required` (workspace
 * content), `none` (platform rows), or `optional` (IAM names and operator
 * programs exist both in a workspace and at platform level).
 */
export type FrnWorkspaceScope = "required" | "none" | "optional";

/** Each service's resource types, the workspace rule, and the child kinds a type may nest. */
export type FrnServiceShape = {
  workspace: FrnWorkspaceScope;
  /** Resource types allowed where the workspace segment is empty; absent means all of `types`. */
  platformTypes?: readonly string[];
  types: readonly string[];
  /** Child kinds by parent type: `project/<id>/flow/<id>` needs `flow` under `project`. */
  children?: Readonly<Record<string, readonly string[]>>;
};

/** The resource vocabulary of the plan's Permissions section, by service. */
export const FRN_SERVICE_SHAPES: Readonly<Record<IamService, FrnServiceShape>> = Object.freeze({
  studio: { workspace: "required", types: ["project", "schedule"], children: { project: ["flow", "recording", "run", "dataset"] } },
  secrets: { workspace: "required", types: ["key"] },
  gateway: { workspace: "required", types: ["browser"] },
  iam: { workspace: "optional", types: ["user", "group", "role", "policy", "service-identity"], platformTypes: ["policy", "service-identity"] },
  ops: { workspace: "optional", types: ["program"] },
  platform: { workspace: "none", types: ["account", "workspace"] }
});
