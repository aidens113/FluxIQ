import type { IamAccessLevel } from "@fluxiq/contracts/iam";
import type { ProgramApiRequest } from "../api.ts";

// The IAM declarations every program endpoint registration carries (hosted
// production plan, Permissions; lane B3, t803). Stable seam for the B3
// workers: change it only with the t803 supervisor.

/** A project's child kinds, as the `studio` FRN shape nests them (`project/<id>/flow/<id>`). */
export type ProgramProjectChildKind = "flow" | "recording" | "run" | "dataset";

/**
 * One resource an endpoint acts on, before the registry turns it into an FRN
 * and resolves its owner. Ids are raw: whatever the payload holds. The
 * registry encodes an id that is not a plain FRN segment and stands a sentinel
 * in for a missing one; a sentinel resource has no owner, so a missing or
 * malformed id can never widen access (an owner-conditioned grant fails on it).
 *
 * - `workspace`: the workspace itself (`frn:fluxiq:platform::workspace/<ws>`):
 *   a top-level create or list, or an action on no specific resource;
 * - `program`: the operator program that registered the endpoint
 *   (`frn:fluxiq:ops:<ws>:program/<programId>`); `ops` endpoints only;
 * - `project`, `project-child`: Automation Studio content; a child is owned by
 *   its project's owner, and is named by its project, never alone;
 * - `schedule`, `key`, `client` (a connected client, the `gateway` service's
 *   `browser/<id>` FRN): the owner is resolved by the program that
 *   registered an owner resolver for the kind;
 * - `user`: an Identity Access user (`frn:fluxiq:iam:<ws>:user/<id>`), owned
 *   by that user. `self: true` names the calling actor's own user.
 */
export type ProgramResourceRef =
  | { kind: "workspace" }
  | { kind: "program" }
  | { kind: "project"; projectId: unknown }
  | { kind: "project-child"; projectId: unknown; child: ProgramProjectChildKind; childId: unknown }
  | { kind: "schedule"; scheduleId: unknown }
  | { kind: "key"; keyId: unknown }
  | { kind: "client"; clientId: unknown }
  | { kind: "user"; userId: unknown }
  | { kind: "user"; self: true };

/**
 * Which resources a call acts on.
 *
 * - `types`: the catalog's `resourceTypes` for the action, as kind chains of
 *   the action's own service (`project`, `project/flow`, `key`, `user`,
 *   `program`), or `["*"]` for the workspace;
 * - `of`: the resources of one call, from its request. Pure and synchronous;
 *   it never throws (read fields defensively) and never reads storage.
 *
 * A create or a list acts on its parent: `create-flow` on its project,
 * `list-flow-runs` on its project, `create-project` and a list across the
 * workspace on the workspace. Build one with `endpointResource`.
 */
export type ProgramEndpointResource = {
  types: readonly string[];
  of(request: ProgramApiRequest): ProgramResourceRef | readonly ProgramResourceRef[];
};

/**
 * Per-item filtering for an endpoint that returns a list spanning resources
 * the caller may not all read (a list across the workspace). After the handler
 * succeeds the registry keeps only the items the caller may `itemAction`
 * (one decision per item, or one row on the full-access fast path), and
 * rebuilds the payload with `replace`.
 *
 * A list scoped to one parent (`list-flow-runs` of a project) needs none: the
 * parent was already decided, and every child has the parent's owner.
 */
export type ProgramEndpointListFilter = {
  /**
   * The action each item is decided by. Absent, it is the endpoint's own
   * action (the usual case: a policy that grants the list on owned items then
   * shows exactly those items).
   */
  itemAction?: string;
  /** The items in a successful response's payload; `[]` when it holds none. */
  items(payload: unknown): readonly unknown[];
  /** The resource one item is. */
  ref(item: unknown): ProgramResourceRef;
  /** The payload with only `kept` (a subset of `items(payload)`, in order). */
  replace(payload: unknown, kept: readonly unknown[]): unknown;
};

/**
 * For an endpoint that creates an owned resource: the resource the successful
 * response created. The registry records the calling actor's user as its owner
 * through the owner resolver of the ref's kind. Null when nothing was created.
 */
export type ProgramEndpointCreates = (payload: unknown, request: ProgramApiRequest) => ProgramResourceRef | null;

/** The IAM fields of a registration (beyond `permission` and `classification`). */
export type ProgramEndpointIamDeclaration = {
  /** `iamActionName(<service>, <endpoint>)`, e.g. `studio:CreateProject`; the registry refuses any other. */
  action: string;
  /** The catalog's level for the action (`iamEndpointAccessLevel`); the registry refuses any other. */
  accessLevel: IamAccessLevel;
  resource: ProgramEndpointResource;
  list?: ProgramEndpointListFilter;
  creates?: ProgramEndpointCreates;
};

/** The resource kinds whose owner a program resolves. */
export type ProgramOwnedResourceKind = "project" | "schedule" | "key" | "client";

/**
 * Resolves, and records, who owns resources of one kind. A program registers
 * one per kind it owns (`GlobalProgramApiRegistry.registerResourceOwners`).
 * `ownerOf` answers a user id, or null for none or unknown (never throws for
 * an unknown id). `recordOwner` is called after a declared `creates`.
 */
export type ProgramResourceOwnerResolver = {
  ownerOf(id: string): Promise<string | null>;
  recordOwner?(id: string, userId: string): Promise<void>;
};
