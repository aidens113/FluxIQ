"use client";

import { useContext, useState, type FormEvent } from "react";
import type { AccountsOutcome, CredentialProof } from "../model";
import { TwoStepContext } from "./two-step";

/** The sentence for an outcome that did not finish. */
function problemOf(outcome: AccountsOutcome): string {
  if (outcome.kind === "denied") return "You do not have access to do this.";
  if (outcome.kind === "needs-proof" || outcome.kind === "refused") return outcome.message;
  return "That did not work. Try again.";
}

/**
 * Confirms a change that moves someone's access: says what will happen, and
 * asks for the administrator's own password, plus their authenticator code
 * only when they have two-step sign-in on. What is typed stays in this
 * component, is sent once with the change, and is cleared after every
 * attempt; it is never shown back.
 */
export function ProofForm(props: { question: string; confirmLabel: string; danger?: boolean; onConfirm: (proof: CredentialProof) => Promise<AccountsOutcome>; onDone: (outcome: AccountsOutcome) => void; onCancel: () => void }) {
  const twoStep = useContext(TwoStepContext);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(undefined);
    let outcome: AccountsOutcome;
    try {
      outcome = await props.onConfirm({ password, ...(twoStep && totp ? { totp } : {}) });
    } catch {
      outcome = { kind: "failed" };
    }
    setPassword("");
    setTotp("");
    setBusy(false);
    if (outcome.kind === "done") {
      props.onDone(outcome);
      return;
    }
    setProblem(problemOf(outcome));
  }

  return (
    <form className="accounts-proof" aria-label={props.question} onSubmit={(event) => void confirm(event)}>
      <p className="accounts-question">{props.question}</p>
      <label className="field"><span className="field-label">Your password</span><input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {twoStep ? <label className="field"><span className="field-label">Code from your authenticator app</span><input autoComplete="one-time-code" inputMode="numeric" required type="text" value={totp} onChange={(event) => setTotp(event.target.value)} /></label> : null}
      {problem ? <p className="accounts-problem" role="alert">{problem}</p> : null}
      <span className="accounts-buttons">
        <button type="submit" className={props.danger ? "button danger" : "button primary"} disabled={busy}>{busy ? "Working…" : props.confirmLabel}</button>
        <button type="button" className="button" disabled={busy} onClick={props.onCancel}>Cancel</button>
      </span>
    </form>
  );
}
