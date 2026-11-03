import type { RecordingTargetPolicyBinding } from "../../../runtime/recording/target-policy/index.ts";
import type { RecordingIngressPolicy } from "./ingress.ts";

/** Adds the selected domain's raw checks without replacing the shared decoder. */
export function domainRecordingIngress<TTarget, TEvidence>(base: RecordingIngressPolicy<TTarget, TEvidence>, policy: RecordingTargetPolicyBinding | undefined, required: boolean): RecordingIngressPolicy<TTarget, TEvidence> {
  if (!policy) {
    if (required) throw new Error("recording.target_policy_missing");
    return base;
  }
  return {
    entry(value) {
      const entry = base.entry.call(base, value);
      if (entry.type !== "action") return entry;
      const issues = [...policy.parameterIssues.call(policy.receiver, entry.parameters, "parameters")];
      if (entry.target !== undefined) {
        if (policy.accepts.call(policy.receiver, entry.target) !== true) throw new Error("recording.invalid_entry");
        issues.push(...policy.targetIssues.call(policy.receiver, entry.target, "target"));
      }
      if (issues.some(issue => issue.severity === "error")) throw new Error("recording.invalid_entry");
      return entry;
    },
    commandTarget(value) {
      const target = policy.commandTarget.call(policy.receiver, value);
      if (policy.accepts.call(policy.receiver, target) !== true || policy.targetIssues.call(policy.receiver, target, "target").some(issue => issue.severity === "error")) throw new Error("recording.invalid_entry");
      // This is only the legacy target type view; the original domain guard ran above.
      return target as TTarget;
    },
    initialState: value => base.initialState.call(base, value)
  };
}
