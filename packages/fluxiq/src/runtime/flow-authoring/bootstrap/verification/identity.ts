import { createHash } from "node:crypto";
import type { AutomationStudioCandidateRequirementBrief } from "./contracts.ts";

/** Validates immutable requirement provenance, then assigns its content digest. */
export function automationStudioCandidateRequirementsDigest(brief: AutomationStudioCandidateRequirementBrief): string {
  const instructions = new Map(brief.instructions.map((instruction) => [instruction.instructionId, instruction.text]));
  if (brief.instructions.some((entry) => !entry.instructionId || typeof entry.text !== "string" || !entry.text) || !instructions.size || instructions.size !== brief.instructions.length || !brief.requirements.length) throw new Error("Candidate requirements must name unique original instructions and outcomes.");
  const ids = new Set<string>();
  for (const requirement of brief.requirements) {
    const source = requirement.source, text = instructions.get(source.instructionId);
    if (!requirement.requirementId || ids.has(requirement.requirementId) || text === undefined || !Number.isInteger(source.start) || !Number.isInteger(source.end) || source.start < 0 || source.end <= source.start || source.end > text.length) throw new Error("Candidate requirement source span or identity is invalid.");
    ids.add(requirement.requirementId);
    if (!["create", "ensure"].includes(requirement.mode) || !["explicit", "all"].includes(requirement.subjects.kind)) throw new Error("Candidate requirement mode/subjects are invalid.");
    if (!requirement.predicates.length || requirement.predicates.some((predicate) => !predicate.field || !["exists", "equals", "contains", "count_equals", "count_at_least"].includes(predicate.kind) || ((predicate.kind === "count_equals" || predicate.kind === "count_at_least") && (!Number.isInteger(predicate.value) || predicate.value < 0)))) throw new Error("Candidate requirement predicate is invalid.");
    if (requirement.subjects.kind === "explicit" && (!requirement.subjects.subjectIds.length || new Set(requirement.subjects.subjectIds).size !== requirement.subjects.subjectIds.length || requirement.subjects.subjectIds.some((id) => !id))) throw new Error("Candidate explicit subjects must be nonempty and unique.");
    if (requirement.subjects.kind === "all" && (!requirement.subjects.scopeId || (requirement.subjects.minimumSubjects !== undefined && (!Number.isInteger(requirement.subjects.minimumSubjects) || requirement.subjects.minimumSubjects < 0)))) throw new Error("Candidate quantified scope is invalid.");
  }
  return createHash("sha256").update(JSON.stringify(brief)).digest("hex");
}
