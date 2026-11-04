/** Bounds the task-attempt parsers enforce. A value past one is refused, never trimmed. */
export const AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS = Object.freeze({
  /** A task, attempt, project, Flow, run, act or part id: letters, digits, `.`, `_`, `:` and `-`, starting with a letter or digit. */
  idPattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u,
  /** A content digest in lower-case hex, with or without its `sha256:` prefix. */
  digestPattern: /^(?:sha256:)?[a-f0-9]{16,128}$/u,
  /** A closed code another record owns, such as a Core tool id or a draft change kind. */
  codePattern: /^[A-Za-z][A-Za-z0-9._:/-]{0,199}$/u,
  /** Characters of one line a person reads. */
  wordsMaxLength: 500,
  /** Characters of a name a person reads. */
  nameMaxLength: 200,
  /** Characters of an answer in the model's own words. */
  answerMaxLength: 4_000,
  /** Rows a result carries inline. The rest stay in the run's dataset. */
  previewMaxRows: 50,
  /** UTF-8 bytes of those rows' JSON. */
  previewMaxBytes: 256 * 1024,
  /** Nesting depth of a preview cell. */
  previewCellMaxDepth: 32,
  /** Entries of a list on a record. */
  listMaxEntries: 1_000,
  /** Things an attempt's tried record holds. */
  triedMaxEntries: 10_000,
  /** Zero-model runs since the last failure that earn `established` (Core's default for a change: `AUTOMATION_STUDIO_CHANGE_CONFIDENCE_DEFAULT_REPLAYS`). */
  establishedZeroModelRuns: 2
});
