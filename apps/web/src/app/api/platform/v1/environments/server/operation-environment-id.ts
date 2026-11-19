import { createHash } from "node:crypto";

/**
 * The environment a create names when its request names none: derived from
 * the workspace and the operation id, so repeating the create with the same
 * operation id names the same environment and stays one environment.
 */
export function operationEnvironmentId(workspaceId: string, operationId: string): string {
  return `env-${createHash("sha256").update(`${workspaceId}\u0000${operationId}`, "utf8").digest("hex").slice(0, 24)}`;
}
