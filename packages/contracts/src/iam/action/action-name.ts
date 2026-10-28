import { IAM_SERVICES, type IamService } from "../service.ts";

/**
 * An action name: `<service>:<Action>`, the action PascalCase
 * (`studio:CreateProject`, `secrets:UseKey`). A policy's `Action` may use
 * wildcards (`isIamActionPattern`); an action name never does.
 */
export const IAM_ACTION_NAME_PATTERN = new RegExp(`^(?:${IAM_SERVICES.join("|")}):[A-Z][A-Za-z0-9]{0,127}$`, "u");

const ENDPOINT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** True for a well-formed action name. */
export function isIamActionName(value: unknown): value is string {
  return typeof value === "string" && IAM_ACTION_NAME_PATTERN.test(value);
}

/**
 * The action generated for a program endpoint: the service prefix, then the
 * kebab-case endpoint name in PascalCase (`create-project` under `studio` is
 * `studio:CreateProject`). Throws a `TypeError` for an endpoint name that is
 * not kebab-case, since the catalog generator must never guess.
 */
export function iamActionName(service: IamService, endpoint: string): string {
  if (!ENDPOINT_PATTERN.test(endpoint)) throw new TypeError(`Endpoint name is not kebab-case: ${JSON.stringify(endpoint)}`);
  const action = endpoint
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");
  return `${service}:${action}`;
}
