/** Writes one step's files, screened, and its `meta.json` last. */
export type AutomationStudioLlmStepLogWriter = {
  readonly folder: string;
  /** A file as given: a string or the exact bytes, unless a credential shape had to be replaced. */
  text(name: string, content: string | Uint8Array): void;
  /** A value as indented JSON. */
  json(name: string, value: unknown): void;
  /**
   * `meta.json`, which says the folder is complete, so it is written after
   * every other file. Carries `redacted: true` when anything in the folder was
   * screened.
   */
  meta(record: Record<string, unknown>): void;
};
