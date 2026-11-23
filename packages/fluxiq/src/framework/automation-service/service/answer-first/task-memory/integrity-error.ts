// A task memory that was read and holds a value Core refuses to act on: an invalid starting model or an
// unreadable automatic processing declaration. It differs from a store that could not be read at all,
// which a best-effort reader takes as nothing: this one must be repaired, never forgotten.

/** The stored task memory holds a value that must be repaired before the task can go on. */
export class AutomationStudioAnswerFirstTaskMemoryIntegrityError extends Error {
  override readonly name = "AutomationStudioAnswerFirstTaskMemoryIntegrityError";
}
