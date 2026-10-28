/**
 * The IAM service prefixes (hosted production plan, Permissions): the first
 * segment of every action (`studio:CreateProject`) and the third of every
 * FluxIQ Resource Name (`frn:fluxiq:studio:...`).
 */
export const IAM_SERVICES = Object.freeze(["studio", "secrets", "gateway", "iam", "ops", "platform"] as const);

export type IamService = (typeof IAM_SERVICES)[number];

const SERVICES: ReadonlySet<string> = new Set(IAM_SERVICES);

/** True for one of `IAM_SERVICES`. */
export function isIamService(value: unknown): value is IamService {
  return typeof value === "string" && SERVICES.has(value);
}

/**
 * The service prefix a program's endpoints are generated under, for the
 * programs the plan names. Operator programs (Database Manager, Deployment
 * Sync, Compute Control, root Docs, framework setup and migrate) map to `ops`;
 * the catalog generator owns that list, since their program ids are its input.
 */
export const IAM_PROGRAM_SERVICE_PREFIXES: Readonly<Record<string, IamService>> = Object.freeze({
  "automation-studio": "studio",
  "secret-keys": "secrets",
  "identity-access": "iam",
  "client-gateway": "gateway"
});
