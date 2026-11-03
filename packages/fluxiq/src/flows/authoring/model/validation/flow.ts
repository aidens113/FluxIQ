import type { AutomationStudioFlowArtifact, AutomationStudioSubflowRole } from "../index.ts";
import { validateExecutableFlow, validateFlowInterface, isSemanticVersion } from "../../../executable/validation/index.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "../../../executable/validation/index.ts";

export type AutomationStudioFlowValidationContext = { subflowRole?: AutomationStudioSubflowRole; externalCheckpointIds?: readonly string[] };

/** Studio validates its persistence envelope around the framework's execution contract. */
export function validateAutomationStudioFlow(flow: AutomationStudioFlowArtifact, context: AutomationStudioFlowValidationContext = {}): AutomationStudioValidationResult {
  const executable = validateExecutableFlow(flow, context);
  const issues: AutomationStudioValidationIssue[] = [];
  // Preserve the established diagnostic order while keeping generic checks in one owner.
  const headerCodes = new Set(["flow.missing_id", "flow.missing_name", "flow.missing_domain_id"]);
  const header = (code: string) => issues.push(...executable.issues.filter(issue => issue.code === code));
  header("flow.missing_id");
  if (!flow.projectId.trim()) addIssue(issues, "error", "flow.missing_project_id", "Flow must have a projectId.", "projectId");
  header("flow.missing_name");
  if (flow.updatedAt < flow.createdAt) addIssue(issues, "error", "flow.updated_before_created", "Flow updatedAt must be greater than or equal to createdAt.", "updatedAt");
  header("flow.missing_domain_id");
  if (flow.source.mode === "code" && !flow.source.moduleId.trim()) addIssue(issues, "error", "flow.missing_code_module", "Code-owned Flow must have a moduleId.", "source.moduleId");
  if (flow.source.mode === "code" && (!flow.source.sourceDigest?.trim() || !flow.source.compiledDigest?.trim() || !flow.source.compilerVersion?.trim())) addIssue(issues, "error", "flow.incomplete_code_compilation", "Code-owned Flow must retain source, compiler, and compiled-plan digests.", "source");
  issues.push(...executable.issues.filter(issue => !headerCodes.has(issue.code)));
  validateFlowPublication(flow, issues);
  return result(issues);
}

function validateFlowPublication(flow: AutomationStudioFlowArtifact, issues: AutomationStudioValidationIssue[]): void {
  const publication = flow.publication;
  if (flow.visibility === "public" && publication.status !== "published" && publication.status !== "deprecated") {
    addIssue(issues, "error", "flow.public_requires_published_version", "Public Flow must have a published version.", "publication.status");
  }
  if (publication.status === "published" || publication.status === "deprecated") {
    if (!isSemanticVersion(publication.version)) addIssue(issues, "error", "flow.invalid_published_version", "Published Flow version must use major.minor.patch semantic versioning.", "publication.version");
    if (publication.publishedAt < flow.createdAt) addIssue(issues, "error", "flow.published_before_created", "Flow publishedAt cannot precede createdAt.", "publication.publishedAt");
    if (!publication.flowDigest.trim()) addIssue(issues, "error", "flow.missing_published_digest", "Published Flow must have an immutable flowDigest.", "publication.flowDigest");
    validateFlowInterface(publication.interface, issues, "publication.interface");
    if (!publication.snapshot) addIssue(issues, "error", "flow.published_snapshot_missing", "Published Flow must retain its immutable execution snapshot.", "publication.snapshot");
    else if (publication.snapshot.flowDigest !== publication.flowDigest || publication.snapshot.version !== publication.version || publication.snapshot.flowId !== flow.flowId) {
      addIssue(issues, "error", "flow.published_snapshot_mismatch", "Published Flow snapshot identity and digest must match the current publication.", "publication.snapshot");
    }
  }
  const historyKeys = new Set<string>();
  for (const [index, snapshot] of (flow.publicationHistory ?? []).entries()) {
    const key = `${snapshot.flowId}@${snapshot.version}`;
    if (snapshot.flowId !== flow.flowId) addIssue(issues, "error", "flow.publication_history_flow_mismatch", "Publication history snapshot must belong to this Flow.", `publicationHistory.${index}.flowId`);
    if (!isSemanticVersion(snapshot.version)) addIssue(issues, "error", "flow.publication_history_invalid_version", "Publication history version must use semantic versioning.", `publicationHistory.${index}.version`);
    if (!snapshot.flowDigest.trim()) addIssue(issues, "error", "flow.publication_history_missing_digest", "Publication history snapshot must retain a digest.", `publicationHistory.${index}.flowDigest`);
    if (historyKeys.has(key)) addIssue(issues, "error", "flow.publication_history_duplicate_version", `Publication history contains duplicate version ${snapshot.version}.`, `publicationHistory.${index}.version`);
    historyKeys.add(key);
  }
}
