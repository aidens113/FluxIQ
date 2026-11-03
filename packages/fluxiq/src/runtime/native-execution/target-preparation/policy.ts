import type { RecordingTargetPolicy, RecordingTargetPolicyBinding } from "../../recording/target-policy/index.ts";
import { nativeTargetPreparationData } from "./data.ts";

/** Pin the complete original policy before any registry mutation. */
export function pinNativeRecordingTargetPolicy(policy: RecordingTargetPolicy): RecordingTargetPolicyBinding {
  if (policy === null || (typeof policy !== "object" && typeof policy !== "function")) throw new Error("Recording target policy must be an object.");
  return Object.freeze({
    receiver: policy,
    accepts: method(policy, "accepts"),
    commandTarget: method(policy, "commandTarget"),
    targetIssues: method(policy, "targetIssues"),
    parameterIssues: method(policy, "parameterIssues")
  });
}

function method<K extends keyof RecordingTargetPolicy>(policy: RecordingTargetPolicy, key: K): RecordingTargetPolicy[K] {
  const callback = nativeTargetPreparationData(policy, key);
  if (typeof callback !== "function") throw new Error(`Recording target policy ${key} must be a function.`);
  return callback;
}
