"use client";

// Answering, in the turn that asked.
//
// Every shape of ask the contract names is answered from here: a permission
// ask grants exactly the classes it listed, a choice picks one option, a
// confirm confirms, and an open ask takes words. The copy for each action is
// data from the thread domain, not a judgement this component makes, and an
// answer with a lasting effect is re-authorized through the shared
// authorization dialog rather than a second PIN field invented here.

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AuthorizationDialog, Button, Field, type AuthorizationCredentials } from "../../../programs/components";
import {
  CONVERSATION_TEXT_MAX,
  conversationAnswerNeedsReauthorization,
  conversationAskPresentation,
  conversationAuthorizationCopy,
  type ConversationAnswer,
  type ConversationAnswerAction,
  type ConversationAsk
} from "../thread";

const EMPTY_CREDENTIALS: AuthorizationCredentials = { password: "", pin: "", totp: "" };

export function ConversationAskForm(props: {
  ask: ConversationAsk;
  busy: boolean;
  error?: string;
  onAnswer(answer: ConversationAnswer, authorizationPin?: string): Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [pendingAction, setPendingAction] = useState<ConversationAnswerAction | null>(null);
  const [credentials, setCredentials] = useState<AuthorizationCredentials>(EMPTY_CREDENTIALS);
  const presentation = conversationAskPresentation(props.ask);

  function choose(action: ConversationAnswerAction) {
    if (props.busy) return;
    if (conversationAnswerNeedsReauthorization(action)) {
      setCredentials(EMPTY_CREDENTIALS);
      setPendingAction(action);
      return;
    }
    void props.onAnswer(action.answer);
  }

  async function authorize() {
    const action = pendingAction;
    if (!action) return;
    const sent = await props.onAnswer(action.answer, credentials.pin);
    if (!sent) return;
    setCredentials(EMPTY_CREDENTIALS);
    setPendingAction(null);
  }

  async function sendText() {
    const value = text.trim();
    if (!value || props.busy) return;
    const sent = await props.onAnswer({ askId: props.ask.askId, kind: "text", text: value });
    if (sent) setText("");
  }

  const authorization = pendingAction ? conversationAuthorizationCopy(props.ask, pendingAction) : null;
  return (
    <section aria-label="Answer this question" className="automation-conversation-ask" role="group">
      <header>
        <ShieldAlert aria-hidden size={16} />
        <strong>{presentation.title}</strong>
      </header>
      {presentation.description ? <span>{presentation.description}</span> : null}
      {presentation.consequencePhrases.length ? (
        <ul aria-label="Consequences requiring approval">
          {presentation.consequencePhrases.map((phrase) => <li key={phrase}>{phrase}</li>)}
        </ul>
      ) : null}
      {props.ask.control?.name
        ? <small>{`The control is "${props.ask.control.name}"${props.ask.control.kind ? ` (${props.ask.control.kind})` : ""}.`}</small>
        : null}
      {presentation.takesText ? (
        <div className="automation-conversation-ask-text">
          <Field hint="Answer in your own words. FluxIQ reads this on its next turn." label="Your answer">
            <textarea
              maxLength={CONVERSATION_TEXT_MAX}
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          <Button busy={props.busy} disabled={!text.trim()} onClick={() => void sendText()} variant="primary">Send answer</Button>
        </div>
      ) : (
        <div className="automation-conversation-ask-actions">
          {presentation.actions.map((action) => (
            <Button
              busy={props.busy && pendingAction?.actionId === action.actionId}
              disabled={props.busy}
              key={action.actionId}
              onClick={() => choose(action)}
              title={action.description ?? undefined}
              variant={action.variant}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
      {authorization ? (
        <AuthorizationDialog
          actionLabel={authorization.actionLabel}
          busy={props.busy}
          credentials={credentials}
          description={authorization.description}
          requirements={{ pin: true }}
          title={authorization.title}
          {...(props.error ? { error: props.error } : {})}
          onAuthorize={() => void authorize()}
          onCancel={() => setPendingAction(null)}
          onChange={setCredentials}
        />
      ) : null}
    </section>
  );
}
