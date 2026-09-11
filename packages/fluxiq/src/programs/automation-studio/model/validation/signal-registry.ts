import type { SignalRegistry } from "../index.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";

export function validateSignalRegistry(registry: SignalRegistry): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const paths = new Set<string>();

  for (const [index, definition] of registry.definitions.entries()) {
    const path = `definitions.${index}`;
    if (!definition.path) {
      addIssue(issues, "error", "signal.missing_path", "Signal definition must have a path.", `${path}.path`);
    }
    if (paths.has(definition.path)) {
      addIssue(issues, "error", "signal.duplicate_path", `Duplicate signal path "${definition.path}".`, `${path}.path`);
    }
    paths.add(definition.path);
    if (definition.defaultWeight < 0 || definition.defaultWeight > 1) {
      addIssue(issues, "error", "signal.invalid_weight", "Signal defaultWeight must be between 0 and 1.", `${path}.defaultWeight`);
    }
    if (definition.derived && !definition.provenance) {
      addIssue(issues, "warning", "signal.derived_without_provenance", "Derived signals should retain extractor provenance.", `${path}.provenance`);
    }
  }

  return result(issues);
}
