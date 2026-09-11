import { isAutomationStudioAdaptiveFailureClass, type AutomationStudioAdaptiveFailureClass } from "./adaptive-class.ts";
import {
  AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS,
  AUTOMATION_STUDIO_FAILURE_STAGES,
  type AutomationStudioFailureRecord,
  type AutomationStudioFailureStage
} from "./record.ts";

const RECORD_FIELDS: ReadonlySet<string> = new Set(["category", "code", "retryable", "stage", "expected", "actual", "evidenceDigest"]);
const FAILURE_STAGES: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_FAILURE_STAGES);
const CODE_PATTERN = /^[A-Za-z0-9._:-]+$/u;
const EVIDENCE_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

// Categories that need a person, a policy change, or a Flow fix before the
// same action can succeed. A record calling one of them retryable
// contradicts itself.
const NEVER_RETRYABLE: ReadonlySet<AutomationStudioAdaptiveFailureClass> = new Set<AutomationStudioAdaptiveFailureClass>([
  "blocked_by_capability_or_policy",
  "missing_router_or_subflow_target",
  "graph_validation_or_unknown_node",
  "external_side_effect_denied",
  "auth_required",
  "user_intervention_required"
]);

// Categories decided while resolving the action's target. A record placing
// one of them at another stage contradicts itself.
const TARGET_RESOLUTION_ONLY: ReadonlySet<AutomationStudioAdaptiveFailureClass> = new Set<AutomationStudioAdaptiveFailureClass>([
  "target_not_found",
  "target_ambiguous"
]);

/**
 * Parses an untrusted value into a failure record, or returns null.
 *
 * Exact fields: an unknown key, a wrong type, an out-of-bounds string, or an
 * inconsistent combination rejects the whole record; nothing is repaired.
 * Consistency rules: `blocked_by_capability_or_policy`,
 * `missing_router_or_subflow_target`, `graph_validation_or_unknown_node`,
 * `external_side_effect_denied`, `auth_required`, and
 * `user_intervention_required` are never retryable; `target_not_found` and
 * `target_ambiguous` may name only the `target_resolution` stage.
 */
export function parseAutomationStudioFailureRecord(value: unknown): AutomationStudioFailureRecord | null {
  try {
    return parseRecord(value);
  } catch {
    return null;
  }
}

function parseRecord(value: unknown): AutomationStudioFailureRecord | null {
  if (!isPlainRecord(value) || !Object.keys(value).every((key) => RECORD_FIELDS.has(key))) return null;
  const { category, code, retryable, stage, expected, actual, evidenceDigest } = value;
  if (!isAutomationStudioAdaptiveFailureClass(category)) return null;
  if (typeof code !== "string" || code.length > AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.codeMaxLength || !CODE_PATTERN.test(code)) return null;
  if (retryable !== true && retryable !== false) return null;
  if (stage !== undefined && !isFailureStage(stage)) return null;
  if (expected !== undefined && !isBoundedText(expected)) return null;
  if (actual !== undefined && !isBoundedText(actual)) return null;
  if (evidenceDigest !== undefined && (typeof evidenceDigest !== "string" || !EVIDENCE_DIGEST_PATTERN.test(evidenceDigest))) return null;
  if (retryable && NEVER_RETRYABLE.has(category)) return null;
  if (stage !== undefined && TARGET_RESOLUTION_ONLY.has(category) && stage !== "target_resolution") return null;
  return {
    category,
    code,
    retryable,
    ...(stage !== undefined ? { stage } : {}),
    ...(expected !== undefined ? { expected } : {}),
    ...(actual !== undefined ? { actual } : {}),
    ...(evidenceDigest !== undefined ? { evidenceDigest } : {})
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFailureStage(value: unknown): value is AutomationStudioFailureStage {
  return typeof value === "string" && FAILURE_STAGES.has(value);
}

function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.textMaxLength;
}
