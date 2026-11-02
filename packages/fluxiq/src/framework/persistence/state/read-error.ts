export class ProgramStateReadError extends Error {
  readonly code = "program_state.invalid";

  constructor(
    readonly filePath: string,
    cause: unknown,
    readonly fileRecoveryAvailable: boolean,
  ) {
    super(
      fileRecoveryAvailable
        ? `Program state is malformed at ${filePath}. Call recoverMalformedState() to archive it and reset this store.`
        : `Program state is malformed at ${filePath}. Inspect and repair the owning SQLite record before retrying.`,
      { cause },
    );
    this.name = "ProgramStateReadError";
  }
}
