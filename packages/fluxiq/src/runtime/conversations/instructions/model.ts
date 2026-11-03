// The model the conversation asks, as a port.
//
// Core's provider adapters answer structured Flow tasks -- bootstrap, repair,
// diagnosis -- each with its own schema and pre-flight checks, and none of them
// is "read this message and pick a panel capability". So the conversation
// declares the one call it needs and nothing more: instructions, the thread so
// far, the message, and a raw answer back. Whatever is bound here may answer
// with a string or an object; `parse.ts` reads either forgivingly.
//
// Bound on the conversations collaborator with `bindModel`. Unbound, the
// conversation still acts: `fallback.ts` matches the person's words to the
// closest capability itself and says in the thread that it did.

/** One turn of the thread as the model reads it. `panel` is a record of what the panel did, written on the person's behalf. */
export type AutomationStudioConversationModelTurn = {
  author: "person" | "automation" | "panel";
  text: string;
};

export type AutomationStudioConversationModelRequest = {
  /** Everything the model is told: the vocabulary, the project's Flows, what is on screen, and the answer shape. */
  instructions: string;
  /** The thread before this message, oldest first and bounded. */
  transcript: AutomationStudioConversationModelTurn[];
  /** What the person just wrote. */
  message: string;
  /** On a retry after an answer that could not be read, what was wrong with it. Null on a first attempt. */
  correction: string | null;
};

/**
 * Who sent the message: the person's user and the session they sent it from.
 * A model whose key is the person's own releases it against this -- Secret
 * Keys hands a key out only to the live, unlocked session of the user who
 * unlocked it -- so the caller travels with every attempt rather than being
 * assumed.
 */
export type AutomationStudioConversationCaller = {
  userId: string;
  sessionId: string;
};

export type AutomationStudioConversationModelExecution = {
  signal: AbortSignal;
  /** Null when the turn did not come from a signed-in person, such as in a test. */
  caller: AutomationStudioConversationCaller | null;
  /**
   * Told what this attempt cost in US dollars, when the model prices its calls
   * (the DeepSeek panel-command call does, from its reply's usage). A model
   * that does not price never calls it, and nothing is carried for it. Called
   * at most once per attempt, before it answers or throws: a reply that could
   * not be used was still paid for.
   */
  paid?(costUsd: number): void;
};

export type AutomationStudioConversationModel = {
  /** A short name for the thread and the record, such as the provider and model. */
  readonly name: string;
  /** One attempt. Throw on failure; a thrown error whose `retryable` is `false` is not tried again. */
  decide(request: AutomationStudioConversationModelRequest, execution: AutomationStudioConversationModelExecution): Promise<unknown>;
};
