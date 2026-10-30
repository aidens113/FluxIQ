/**
 * The authenticated app routes `GlobalProgramApiRegistry.call` decides by each
 * registration's own IAM declaration (its action, permission and resources),
 * rather than by `APP_ROUTE_IAM_CONTRACTS`. Deciding them again in the route
 * would decide and audit each call twice.
 */
export const APP_ROUTES_DECIDED_BY_REGISTRY: readonly { path: string; methods: readonly string[] }[] = Object.freeze([
  { path: "/api/programs/[programId]/[endpoint]", methods: Object.freeze(["GET", "POST"]) }
]);
