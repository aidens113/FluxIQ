import { formatFluxIQResourceName } from "@fluxiq/contracts/iam";

/**
 * The FRN of an operator program, `frn:fluxiq:ops:<workspaceId>:program/<programId>`,
 * or `frn:fluxiq:ops::program/<programId>` at platform level (`workspaceId`
 * null). Throws a `TypeError` for an id the FRN grammar refuses.
 */
export function iamProgramFrn(workspaceId: string | null, programId: string): string {
  return formatFluxIQResourceName({ service: "ops", workspaceId, resourceType: "program", resourceId: programId });
}
