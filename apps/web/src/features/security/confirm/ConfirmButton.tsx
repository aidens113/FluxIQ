"use client";

import { useState } from "react";
import type { ChangeResult } from "../data";

type Phase = "idle" | "asking" | "working";

/** A destructive action that asks first. `onConfirm` says what became of it; a refusal reads as "no access", not as an error. */
export function ConfirmButton(props: { label: string; question: string; confirmLabel: string; onConfirm: () => Promise<ChangeResult>; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<string>();
  const ask = () => {
    setProblem(undefined);
    setPhase("asking");
  };
  const confirm = async () => {
    setPhase("working");
    let result: ChangeResult;
    try {
      result = await props.onConfirm();
    } catch {
      result = "failed";
    }
    if (result === "done") {
      setPhase("idle");
      setProblem(undefined);
      props.onDone();
      return;
    }
    setProblem(result === "denied" ? "You do not have access to do this." : "That did not work. Try again.");
    setPhase("idle");
  };
  if (phase === "idle") {
    return (
      <span className="security-action">
        <button type="button" className="security-button" onClick={ask}>{props.label}</button>
        {problem ? <span className="security-error" role="alert">{problem}</span> : null}
      </span>
    );
  }
  return (
    <span className="security-action" role="group" aria-label={props.question}>
      <span>{props.question}</span>
      <button type="button" className="security-button security-danger" disabled={phase === "working"} onClick={() => void confirm()}>{props.confirmLabel}</button>
      <button type="button" className="security-button" disabled={phase === "working"} onClick={() => setPhase("idle")}>Cancel</button>
    </span>
  );
}
