import type { AutomationStudioImporterImplementationBundle } from "../../../components/automation/importer/index.ts";
import type { OutputTargetPreparerBinding } from "../../output-dispatch/contracts/index.ts";
import type { RecordingEntryTargetPreparerBinding } from "../../recording/target-preparation/index.ts";
import type { RecordingTargetPolicyBinding } from "../../recording/target-policy/index.ts";
import type { NativeTargetPreparationReader } from "./reader.ts";
import { nativeTargetPreparationData } from "./data.ts";
import { pinNativeRecordingTargetPolicy } from "./policy.ts";

/** The native binder stages the complete domain policy and hooks before any SDK mutation. */
export class NativeTargetPreparationRegistry {
  readonly #outputs = new Map<string, OutputTargetPreparerBinding>();
  readonly #recordings = new Map<string, RecordingEntryTargetPreparerBinding>();
  readonly #policies = new Map<string, RecordingTargetPolicyBinding>();
  readonly #required = new Map<string, boolean>();
  readonly reader: NativeTargetPreparationReader = Object.freeze({
    output: (domainId: string) => this.#outputs.get(domainId),
    recording: (domainId: string) => this.#recordings.get(domainId),
    policy: (domainId: string) => this.#policies.get(domainId),
    requiresRecordingPolicy: (domainId: string) => this.#required.get(domainId) === true
  });

  prepare(domainId: string, bundle: AutomationStudioImporterImplementationBundle, recordingTargetPolicyRequired?: true): () => void {
    const output = nativeTargetPreparationData(bundle, "outputTargetPreparer");
    const recording = nativeTargetPreparationData(bundle, "recordingEntryTargetPreparer");
    const policy = nativeTargetPreparationData(bundle, "recordingTargetPolicy");
    if (recordingTargetPolicyRequired !== undefined && recordingTargetPolicyRequired !== true) throw new Error(`Recording target policy requirement for domain ${domainId} must be true or absent.`);
    if (output !== undefined && typeof output !== "function") throw new Error(`Output target preparer for domain ${domainId} must be a function.`);
    if (recording !== undefined && typeof recording !== "function") throw new Error(`Recording entry target preparer for domain ${domainId} must be a function.`);
    const policyBinding = policy === undefined ? undefined : pinNativeRecordingTargetPolicy(policy);
    const required = recordingTargetPolicyRequired === true;
    const check = (): void => {
      const registeredOutput = this.#outputs.get(domainId);
      const registeredRecording = this.#recordings.get(domainId);
      const registeredPolicy = this.#policies.get(domainId);
      if (output && registeredOutput && (registeredOutput.callback !== output || registeredOutput.receiver !== bundle)) throw new Error(`A different output target preparer function or receiver is already registered for domain ${domainId}.`);
      if (recording && registeredRecording && (registeredRecording.callback !== recording || registeredRecording.receiver !== bundle)) throw new Error(`A different recording entry target preparer function or receiver is already registered for domain ${domainId}.`);
      if (policyBinding && registeredPolicy && (registeredPolicy.receiver !== policyBinding.receiver || registeredPolicy.accepts !== policyBinding.accepts || registeredPolicy.commandTarget !== policyBinding.commandTarget || registeredPolicy.targetIssues !== policyBinding.targetIssues || registeredPolicy.parameterIssues !== policyBinding.parameterIssues)) throw new Error(`A different recording target policy function or receiver is already registered for domain ${domainId}.`);
      if (this.#required.has(domainId) && this.#required.get(domainId) !== required) throw new Error(`A different recording target policy requirement is already registered for domain ${domainId}.`);
    };
    check();
    const outputBinding = output ? Object.freeze({ receiver: bundle, callback: output }) : undefined;
    const recordingBinding = recording ? Object.freeze({ receiver: bundle, callback: recording }) : undefined;
    return () => {
      check();
      if (outputBinding && !this.#outputs.has(domainId)) this.#outputs.set(domainId, outputBinding);
      if (recordingBinding && !this.#recordings.has(domainId)) this.#recordings.set(domainId, recordingBinding);
      if (policyBinding && !this.#policies.has(domainId)) this.#policies.set(domainId, policyBinding);
      if (!this.#required.has(domainId)) this.#required.set(domainId, required);
    };
  }
}
