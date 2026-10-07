import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioCandidateRequirementBrief, AutomationStudioCandidateRequirementPredicate, AutomationStudioCandidateExecutionReceipt, AutomationStudioCandidateObservedEvidence, AutomationStudioCandidateRequirementResult, AutomationStudioCandidateStartReceipt } from "./contracts.ts";

/** Trusted facts, checked deterministically. Unknown never means satisfied. */
export function evaluateAutomationStudioCandidateRequirements(input: {
  brief: AutomationStudioCandidateRequirementBrief;
  start: AutomationStudioCandidateStartReceipt;
  execution: AutomationStudioCandidateExecutionReceipt;
  evidence: AutomationStudioCandidateObservedEvidence;
}): AutomationStudioCandidateRequirementResult[] {
  return input.brief.requirements.map((requirement) => {
    const codes = new Set<string>(), observationIds = new Set<string>();
    let unknown = false, contradicted = false;
    const requested = requirement.subjects;
    const scope = requested.kind === "all" ? input.evidence.enumerations.find((entry) => entry.scopeId === requested.scopeId) : undefined;
    const subjects = requirement.subjects.kind === "explicit" ? requirement.subjects.subjectIds : scope?.subjectIds ?? [];
    const minimum = requirement.subjects.kind === "all" ? Math.max(requirement.mode === "create" ? 1 : 0, requirement.subjects.minimumSubjects ?? 0) : 0;
    if (requirement.subjects.kind === "all" && (!scope?.complete || subjects.length < minimum)) { unknown = true; codes.add("candidate.subject_coverage_incomplete"); }
    if (requirement.mode === "create" && input.execution.executedNodeCount === 0) { unknown = true; codes.add("candidate.create_not_executed"); }
    for (const subjectId of subjects) {
      const observations = input.evidence.observations.filter((entry) => entry.subjectId === subjectId);
      if (!observations.length) { unknown = true; codes.add("candidate.subject_unobserved"); }
      for (const predicate of requirement.predicates) {
        const relevant = observations.filter((entry) => Object.prototype.hasOwnProperty.call(entry.fields, predicate.field));
        if (!relevant.length) { unknown = true; codes.add("candidate.required_field_missing"); continue; }
        for (const observed of relevant) {
          observationIds.add(observed.observationId);
          const passed = matches(predicate, observed.fields[predicate.field]!);
          const complete = observed.completeFields.includes(predicate.field);
          const value = observed.fields[predicate.field]!;
          const reliableMismatch = complete || predicate.kind === "equals" || predicate.kind === "exists" || (predicate.kind === "count_equals" && Array.isArray(value) && value.length > predicate.value);
          if (!passed && reliableMismatch) { contradicted = true; codes.add("candidate.observed_contradiction"); }
          else if (!passed) { unknown = true; codes.add("candidate.partial_value_inconclusive"); }
          // A concrete contradiction stands even when the rest is incomplete.
          if (!observed.completeFields.includes(predicate.field)) { unknown = true; codes.add("candidate.field_coverage_incomplete"); }
        }
      }
      if (requirement.mode === "create") {
        const produced = observations.some((observed) => {
          const command = input.execution.commands.find((entry) => entry.commandId === observed.newlyProduced?.commandId);
          const baseline = input.start.subjectStates.find((entry) => entry.observationId === observed.newlyProduced?.startObservationId);
          return baseline?.subjectId === subjectId && baseline.existed === false && command?.outcome === "performed" && command.subjectIds.includes(subjectId) && command.finishedAt <= observed.observedAt;
        });
        if (!produced) { unknown = true; codes.add("candidate.new_result_unattributed"); }
      }
    }
    return { requirementId: requirement.requirementId, outcome: contradicted ? "unsatisfied" : unknown ? "unknown" : "satisfied", codes: [...codes], observationIds: [...observationIds] };
  });
}

function matches(predicate: AutomationStudioCandidateRequirementPredicate, value: JsonValue): boolean {
  if (predicate.kind === "exists") return value !== null;
  if (predicate.kind === "equals") return canonical(value) === canonical(predicate.value);
  if (predicate.kind === "contains") return Array.isArray(value) && value.some((entry) => canonical(entry) === canonical(predicate.value));
  return Array.isArray(value) && (predicate.kind === "count_equals" ? value.length === predicate.value : value.length >= predicate.value);
}
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}
