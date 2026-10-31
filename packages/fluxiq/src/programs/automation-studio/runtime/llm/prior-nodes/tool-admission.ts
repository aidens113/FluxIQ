import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../decision-handlers/index.ts";
import type { AutomationStudioLlmEvidenceLoopRemaining } from "../loop-budget.ts";
import { automationStudioLlmEvidenceRequestSignature } from "../repeat-policy.ts";
import type { AutomationStudioLlmEvidenceAnsweredRequestCode, AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";

/** The same offering/repeat gate serves ordinary calls and private prior-call members. */
export function automationStudioLlmEvidenceToolAdmission(input: {
  toolId: string;
  value: JsonObject;
  toolsById: ReadonlyMap<string, AutomationStudioLlmEvidenceTool>;
  eligibleToolIds: ReadonlySet<string>;
  offered: readonly AutomationStudioLlmEvidenceTool[];
  looks: AutomationStudioLlmEvidenceDecisionHandlerContext["looks"];
  repeats: AutomationStudioLlmEvidenceDecisionHandlerContext["repeats"];
  answeredRequests: ReadonlyMap<string, string>;
  latestObservations: ReadonlyMap<string, string>;
  attemptEpoch: number;
  mutationEpoch: number;
  draftKey?: string | undefined;
  withholds(toolId: string, value: JsonObject): boolean;
  discoveryOnly: boolean;
  finalDecision: boolean;
  remaining: AutomationStudioLlmEvidenceLoopRemaining | undefined | false;
  deadlineExpired: boolean;
  rerunning?: boolean;
  /** Only a selected, sealed successful original may bypass its successful answer once. */
  priorSuccessful?: boolean;
}) {
  const tool = input.toolsById.get(input.toolId);
  const withdrawn = !input.rerunning && tool !== undefined && input.looks.refuses(tool, input.value, input.attemptEpoch);
  const candidateOfferedTool = input.discoveryOnly && input.offered.some((offered) => offered.toolId === input.toolId);
  const deadline = candidateOfferedTool && input.deadlineExpired;
  const final = input.finalDecision && Boolean(input.remaining && input.remaining.limitedBy !== "cost") && !candidateOfferedTool;
  if (!tool) return { tool, withdrawn, deadline, final };
  const signature = automationStudioLlmEvidenceRequestSignature({ tool, mutationEpoch: input.mutationEpoch, attemptEpoch: input.attemptEpoch, input: input.draftKey ? { ...input.value, draftKey: input.draftKey } : input.value });
  const answeredBy = input.answeredRequests.get(signature);
  const reobservation = !input.eligibleToolIds.has(input.toolId), withheld = input.withholds(input.toolId, input.value);
  const blocked = withheld || input.rerunning ? undefined : input.repeats.blocks(input.toolId, input.value);
  // A list's explicit repeat intent bypasses only the successful original's cache.
  // Failed, uncertain and no-progress outcomes stay binding, including same_answer.
  const triedHere = !input.priorSuccessful && blocked?.outcome === "same_answer" && (answeredBy !== undefined || reobservation) ? undefined : blocked;
  const answered = !input.rerunning && (withheld || reobservation || (!input.priorSuccessful && answeredBy !== undefined));
  const code: AutomationStudioLlmEvidenceAnsweredRequestCode = withheld ? "llm_evidence_loop.not_offered" : answeredBy !== undefined ? "llm_evidence_loop.already_answered" : "llm_evidence_loop.already_observed";
  const by = withheld ? input.latestObservations.get(input.toolId) ?? "" : answeredBy ?? input.latestObservations.get(input.toolId)!;
  const offered = input.offered.find((candidate) => candidate.toolId === input.toolId);
  const properties = offered?.inputSchema.properties;
  const node = properties && typeof properties === "object" && !Array.isArray(properties) ? properties.node : undefined;
  return { tool, withdrawn, deadline, final, signature, triedHere, answered, code, by, withheld, reobservation, nodeOffered: acceptsNode(node, input.value.node) };
}

/** Only the offered node selector is inspected; all parameter/permission validation remains with the runner. */
function acceptsNode(schema: unknown, node: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return true;
  const value = schema as Record<string, unknown>;
  if (Object.hasOwn(value, "const") && value.const !== node) return false;
  if (Array.isArray(value.enum) && !value.enum.includes(node)) return false;
  if (Array.isArray(value.allOf) && !value.allOf.every((part) => acceptsNode(part, node))) return false;
  if (Array.isArray(value.anyOf) && !value.anyOf.some((part) => acceptsNode(part, node))) return false;
  if (Array.isArray(value.oneOf) && value.oneOf.filter((part) => acceptsNode(part, node)).length !== 1) return false;
  return value.not === undefined || !acceptsNode(value.not, node);
}
