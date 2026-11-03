/** Infrastructure coverage is unknown; this does not imply the person's keys are locked. */
export class SecretProviderKeyCompletionUnknownError extends Error {
  constructor() {
    super("model.secret.completion_unknown");
    this.name = "SecretProviderKeyCompletionUnknownError";
  }
}
