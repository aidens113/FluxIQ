// How a host that knows more about a question than the chat does shows it, and
// how a person re-authorizes an answer with a lasting effect. Absent, the chat
// shows its own buttons (`conversation/ask-copy.ts`).

/** One answer a person can give with one press. */
export type ChatAskAction = {
  id: string;
  label: string;
  /** Said on hover. */
  description?: string | null;
  tone: "primary" | "secondary" | "danger";
  /** What `ChatAnswer` carries when this is pressed. */
  kind: string;
  value?: string;
  /** Present when the answer has a lasting effect: the words of the dialog that asks for the PIN first. */
  reauthorize?: { title: string; description: string; actionLabel: string };
};

/** A pending question, in the host's words. The chat draws it. */
export type ChatAskPresentation = {
  title: string;
  /** The lead line. Empty when the turn's own words already say it. */
  description: string;
  /** What an answer would commit, one phrase each. */
  consequences: readonly string[];
  /** A quiet line under them, naming the control the question is about. */
  note?: string;
  actions: readonly ChatAskAction[];
  /** True: a text box and a Send answer button instead of `actions`. */
  takesText: boolean;
  textHint?: string;
  textMax?: number;
};

/** What the dialog's Authorize press came to. A refusal keeps the dialog open, saying why. */
export type ChatReauthorizeOutcome = { ok: true } | { ok: false; error: string };

/**
 * One re-authorization. The host draws the dialog and owns the PIN field;
 * `submit` sends the answer with that PIN, and answers whether it went. The chat
 * holds the PIN only for that one call. `cancel` sends nothing.
 */
export type ChatReauthorizeRequest = {
  title: string;
  description: string;
  actionLabel: string;
  submit(pin: string): Promise<ChatReauthorizeOutcome>;
  cancel(): void;
};

export type ChatAskPort = {
  /** `ask` is Core's record as it answered it. Null: the chat's own presentation of this one. */
  present(ask: unknown): ChatAskPresentation | null;
  /** Draws the PIN dialog. Absent: an action that needs it shows "Answer this in FluxIQ" and the open control. */
  reauthorize?(request: ChatReauthorizeRequest): void;
};
