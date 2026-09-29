// What a person's message became: something to do, one question back, or a
// plain answer.
//
// A person writing in the chat window is either asking for something to be
// done in the control panel, saying something that needs an answer, or saying
// something too ambiguous to act on. The model reads the message with the
// panel's vocabulary and the thread so far and picks one of those three; Core
// fills in whatever it can derive and writes the outcome into the thread, so
// the person sees what was understood before or while it happens.
//
// Types only. `parse.ts` builds a decision from what a model wrote,
// `fallback.ts` builds one from the words alone when no model could be used,
// and `respond.ts` writes it into the thread.

/** A Flow in the project, as a person or a model would name it. */
export type AutomationStudioConversationFlowReference = {
  flowId: string;
  name: string;
};

/** What the panel has open while the person writes. Every field may be absent. */
export type AutomationStudioConversationOnScreen = {
  flowId?: string;
  subflowId?: string;
  runId?: string;
  recordingId?: string;
};

/** A capability to run, with everything Core could fill in already filled. */
export type AutomationStudioConversationInvocation = {
  capabilityId: string;
  title: string;
  arguments: Record<string, unknown>;
  /** One when the capability was named exactly; lower when Core matched it to the closest one. */
  confidence: number;
  /** What was actually written, when it was not the capability's exact id. */
  requestedId: string | null;
  /** Argument names that were written differently, and the name each was taken as. */
  renamedArguments: Record<string, string>;
  /** Argument names nothing matched, left out rather than sent. */
  droppedArguments: string[];
  /** True only when it deletes something or moves money, so the person confirms it in the thread first. */
  asksFirst: boolean;
  /** The gated consequence classes it carries, in Core's own words. Empty unless `asksFirst`. */
  consequences: string[];
};

export type AutomationStudioConversationDecision =
  | { kind: "invoke"; invocation: AutomationStudioConversationInvocation; say: string | null }
  | { kind: "clarify"; question: string }
  | { kind: "reply"; text: string };

/** Who decided: the model, or Core matching the words itself because the model could not be used. */
export type AutomationStudioConversationDecisionSource = "model" | "closest_match";

/** A decision, how it was reached, and why the model was not the one to reach it when it was not. */
export type AutomationStudioConversationInterpretation = {
  decision: AutomationStudioConversationDecision;
  source: AutomationStudioConversationDecisionSource;
  /** Plain English, for the thread: why the model could not decide. Null when it did. */
  modelProblem: string | null;
  /** Model calls made, including retries. Zero when no model is connected. */
  attempts: number;
};

/** What the endpoint answers with after a person's turn, beside the turn itself. */
export type AutomationStudioConversationResponse = AutomationStudioConversationInterpretation & {
  /** The turn Core wrote in answer: the reply, the question, what it is doing, or the confirmation it asks for. */
  turnId: string;
  /** Set when the invocation waits for the person's confirmation; the ask's id. */
  askId: string | null;
  /** True when the panel should run the invocation now. False for a reply, a question, or one waiting on confirmation. */
  runNow: boolean;
};
