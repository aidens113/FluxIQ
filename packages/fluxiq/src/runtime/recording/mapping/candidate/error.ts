import { recordingMappingIdentity } from "../identity.ts";

const messages = new WeakMap<object, string>();

/** Only errors minted here can contribute a validation message to public issues. */
export class RecordingCandidateValidationError extends Error {
  private constructor(message: string) {
    super(message);
    messages.set(this, message);
  }

  static output(kind: "missing" | "undeclared" | "unregistered", id = ""): RecordingCandidateValidationError {
    return new this(kind === "missing" ? "Recording mapper candidates must declare an outputId." : `Recording mapper emitted ${kind} output ${recordingMappingIdentity(id)}.`);
  }

  static input(kind: "missing_source" | "state_source" | "missing_confirmation" | "state_confirmation", id: string): RecordingCandidateValidationError {
    const safe = recordingMappingIdentity(id);
    const message = kind === "missing_source" ? `Recording mapper referenced unregistered input ${safe}.`
      : kind === "state_source" ? `Recording mapper source input ${safe} is state-eligible and cannot be reclassified as an action.`
      : kind === "missing_confirmation" ? `Recording mapper referenced unregistered confirmation input ${safe}.`
      : `Confirmation input ${safe} must be an action-role observation.`;
    return new this(message);
  }

  static recordOutput(outputId: string, issues: readonly string[]): RecordingCandidateValidationError {
    return new this(`Recording mapper candidate for ${recordingMappingIdentity(outputId)} has an invalid recordOutput: ${issues.map(recordingMappingIdentity).join(", ")}`);
  }

  static timeout(outputId: string): RecordingCandidateValidationError {
    return new this(`Recording mapper candidate for ${recordingMappingIdentity(outputId)} has an invalid timeoutMs: it must be a whole number of milliseconds above zero.`);
  }

  static normalizer(outputId: string): RecordingCandidateValidationError {
    return new this(`Recording mapper normalizer for ${recordingMappingIdentity(outputId)} must return a plain parameter object.`);
  }

  static publicMessage(error: unknown): string {
    return error !== null && typeof error === "object" ? messages.get(error) ?? "Unknown mapper error." : "Unknown mapper error.";
  }
}
