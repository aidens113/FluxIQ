import type { GlobalProgramApiRegistry } from "fluxiq";

// The types of the app route IAM table (hosted production plan, Permissions;
// lane B3, t803-H2). Derived from `GlobalProgramApiRegistry.authorize`, so the
// table and the registry cannot disagree about what a decision takes.

type AuthorizeInput = Parameters<GlobalProgramApiRegistry["authorize"]>[0];

/** What decides an app route: the registry's `authorize`, nothing else of it. */
export type AppRouteAuthorizer = Pick<GlobalProgramApiRegistry, "authorize">;

/** Who calls, as the registry sees them. */
export type AppRouteActor = NonNullable<AuthorizeInput["actor"]>;

/** One of the eight permissions. */
export type AppRoutePermissionName = AuthorizeInput["permission"];

/** The resources one call acts on, as refs the registry turns into FRNs. */
export type AppRouteResourceRefs = NonNullable<AuthorizeInput["resources"]>;

export type AppRouteMethod = "GET" | "POST" | "PUT";

/**
 * How the call arrived: the web panel's login cookie, or a paired client's
 * bearer token. It becomes the actor's `channel`.
 */
export type AppRouteCaller = "panel" | "paired-client";

/**
 * The permission a caller needed before IAM, exactly: one permission, or
 * `none` where the route checked only that the caller was authenticated.
 */
export type AppRoutePermission = AppRoutePermissionName | "none";

/** The values a route read from its request (params, body fields, session fields) that its resources come from. */
export type AppRouteResourceInput = Readonly<Record<string, unknown>>;

/**
 * Where a route's resources come from: `from` says it in words (the report and
 * the tests read it), `of` builds them. `of` is pure, never throws and never
 * reads storage; a missing or malformed id becomes the registry's sentinel,
 * which no one owns.
 */
export type AppRouteResource = {
  readonly from: string;
  of(input: AppRouteResourceInput): AppRouteResourceRefs;
};

/**
 * One authenticated app route and method, as the registry decides it.
 *
 * - `variant`: the body's `action` on a route that multiplexes (framework setup);
 * - `action`: `<service>:<PascalCase>`; framework routes are `ops`, which
 *   `FluxIQServiceGuardrail` denies on `service`;
 * - `callers`: each caller the route accepts and the permission it required
 *   of that caller before IAM; a caller absent here is refused by the route
 *   before any decision;
 * - `programId`: the operator program a `{ kind: "program" }` ref names.
 */
export type AppRouteIamContract = {
  readonly path: string;
  readonly method: AppRouteMethod;
  readonly variant?: string;
  readonly action: string;
  readonly callers: Readonly<Partial<Record<AppRouteCaller, AppRoutePermission>>>;
  readonly programId?: string;
  readonly resource: AppRouteResource;
};

/** A refusal, in the shape the routes always answered: status and the sentence. */
export type AppRouteRefusal = { status: 401 | 403; error: string };
