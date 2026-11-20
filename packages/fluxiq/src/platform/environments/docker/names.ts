import { ENVIRONMENT_ID_PATTERN } from "../model/index.ts";

/** An environment's container and profile volume names: `<project>-env-<environmentId>` and that plus `-profile`. */
export function dockerEnvironmentNames(project: string, environmentId: string): { container: string; volume: string } {
  // An id that is not an environment's could name another resource, or none.
  if (typeof environmentId !== "string" || !ENVIRONMENT_ID_PATTERN.test(environmentId)) throw new TypeError("Invalid environment id");
  if (!/^[a-z0-9][a-z0-9_.-]*$/u.test(project)) throw new TypeError("Invalid Docker project name");
  const container = `${project}-env-${environmentId}`;
  return { container, volume: `${container}-profile` };
}
