import { iamActionName } from "@fluxiq/contracts/iam";
import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import { iamEndpointAccessLevel, iamProgramService } from "../../../platform/iam/catalog/index.ts";
import type { Permission } from "../../identity-access/index.ts";
import { assistantEndpointConsequence } from "./endpoint-consequence.ts";
import { assistantToolName } from "./tool-name.ts";
import type { AssistantEndpointSummary } from "./types.ts";

/** A catalog entry plus what deciding a call on it needs: its IAM action and today's permission. */
export type AssistantTool = AssistantToolEntry & { action: string; permission: Permission };

/**
 * The tool an endpoint declares, or undefined for a hidden or undeclared one.
 * The access level is the catalog's (`iamEndpointAccessLevel`), which the
 * registry already holds every declaration to.
 */
export function assistantToolOf(endpoint: AssistantEndpointSummary): AssistantTool | undefined {
  const declaration = endpoint.assistant;
  if (declaration === undefined || "hidden" in declaration) return undefined;
  const action = iamActionName(iamProgramService(endpoint.programId), endpoint.endpoint);
  const accessLevel = endpoint.accessLevel ?? iamEndpointAccessLevel(action, endpoint.endpoint, endpoint.classification);
  const subject = { programId: endpoint.programId, endpoint: endpoint.endpoint, classification: endpoint.classification, accessLevel };
  const consequence = assistantEndpointConsequence(declaration.consequence === undefined ? subject : { ...subject, declared: declaration.consequence });
  return {
    name: assistantToolName(endpoint.programId, endpoint.endpoint),
    programId: endpoint.programId,
    endpoint: endpoint.endpoint,
    summary: declaration.summary.trim(),
    phrases: Object.freeze((declaration.phrases ?? []).map((phrase) => phrase.trim())),
    consequence,
    contextArgs: Object.freeze({ ...declaration.contextArgs }),
    inputSchema: declaration.input.jsonSchema(),
    action,
    permission: endpoint.permission
  };
}
