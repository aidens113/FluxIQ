export type AutomationStudioRecoveryDeadline = {
  schemaVersion: "automation-studio.recovery-deadline.v1";
  startedAtMs: number;
  maxDurationMs: number;
  /** The instant the whole recovery must be finished by. Computed once. */
  expiresAtMs: number;
};
