const issued = new WeakSet<object>();

/** Memory-only authority issued by Core to an uninterrupted complete journal, never restored or exposed as a reset flag. */
export const automationStudioAnswerFirstJournalOwners = {
  create(): object {
    const owner = Object.freeze({});
    issued.add(owner);
    return owner;
  },
  has(value: object | undefined): value is object {
    return value !== undefined && issued.has(value);
  }
};
