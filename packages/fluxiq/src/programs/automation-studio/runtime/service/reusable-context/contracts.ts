import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioProjectContentProtection, AutomationStudioReusableLlmContextList, AutomationStudioReusableLlmContextRecord } from "../../../storage/index.ts";

// The reusable LLM context feature as a host configures it, asks for a
// selection, and reads its status back.

export type AutomationStudioReusableLlmContextOption = {
  enabled?: boolean;
  contentProtection?: AutomationStudioProjectContentProtection;
  selectForFreshEvidence?: (input: AutomationStudioReusableLlmContextFreshEvidenceInput) => AutomationStudioReusableLlmContextSelection | undefined | Promise<AutomationStudioReusableLlmContextSelection | undefined>;
};

export type AutomationStudioReusableLlmContextFreshEvidenceInput = {
  taskKind: "flow_bootstrap" | "runtime_diagnosis" | "runtime_patch";
  projectId: string;
  flowId: string;
  subflowId?: string;
  freshEvidence: JsonValue;
  freshEvidenceCount: number;
};

export type AutomationStudioReusableLlmContextSelection = Pick<AutomationStudioReusableLlmContextList,
  "domainId" | "evidenceKind" | "evidenceSchemaVersion" | "sanitizerVersion" | "compatibilityTags"
>;

export type AutomationStudioReusableLlmContextHostConfiguration = {
  enabled: true;
  contentProtection: AutomationStudioProjectContentProtection;
  selectForFreshEvidence: NonNullable<AutomationStudioReusableLlmContextOption["selectForFreshEvidence"]>;
};

export type AutomationStudioReusableLlmContextSummary = Omit<AutomationStudioReusableLlmContextRecord, "promptProjection">;
export type AutomationStudioReusableLlmContextFeatureStatus = {
  enabled: boolean;
  writeEnabled: boolean;
  contentProtection: string;
  blockerCode?: "reusable_context.content_protection_unavailable";
};
