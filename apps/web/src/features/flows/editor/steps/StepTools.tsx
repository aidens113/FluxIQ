"use client";

import { useState, type FormEvent } from "react";
import type { StepView } from "../../model";
import { AddStep } from "./AddStep";
import { StepValues } from "./StepValues";
import { useStepActions } from "./step-actions";

type Open = "none" | "words" | "values" | "add";

/** What a person can do to one step: change its words or values, move it, add a step after it, or delete it. */
export function StepTools(props: { step: StepView }) {
  const actions = useStepActions();
  const { step } = props;
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState<Open>("none");
  const [words, setWords] = useState(step.plainWords);
  const toggle = (next: Open) => setOpen((was) => (was === next ? "none" : next));
  const send = (edit: Parameters<typeof actions.edit>[0]) => actions.edit(edit, step.key);
  const saveWords = async (event: FormEvent) => {
    event.preventDefault();
    if (await send({ kind: "set-words", step: step.number, words })) setOpen("none");
  };
  const openWords = () => {
    setWords(step.plainWords);
    toggle("words");
  };
  const nodeId = step.nodeIds[0];
  return (
    <div className="flows-tools">
      <button type="button" className="flows-tool flows-edit-toggle" aria-expanded={shown} aria-label={`${shown ? "Close" : "Edit"} step ${step.number}`} onClick={() => setShown((was) => !was)}>
        {shown ? "Close" : "Edit"}
      </button>
      {shown ? <div className="flows-tool-row" role="group" aria-label={`Change step ${step.number}`}>
        <button type="button" className="flows-tool" aria-expanded={open === "words"} onClick={openWords}>Change words</button>
        <button type="button" className="flows-tool" aria-expanded={open === "values"} onClick={() => toggle("values")}>Values</button>
        <button type="button" className="flows-tool" disabled={actions.busy} aria-label={`Move step ${step.number} up`} onClick={() => void send({ kind: "move", step: step.number, direction: "up" })}>Move up</button>
        <button type="button" className="flows-tool" disabled={actions.busy} aria-label={`Move step ${step.number} down`} onClick={() => void send({ kind: "move", step: step.number, direction: "down" })}>Move down</button>
        <button type="button" className="flows-tool" aria-expanded={open === "add"} aria-label={`Add a step after step ${step.number}`} onClick={() => toggle("add")}>Add after</button>
        <button type="button" className="flows-tool" data-danger disabled={actions.busy} aria-label={`Delete step ${step.number}`} onClick={() => void send({ kind: "delete", step: step.number })}>Delete</button>
      </div> : null}
      {shown && open === "words" ? (
        <form className="flows-form flows-inline" onSubmit={(event) => void saveWords(event)} onKeyDown={(event) => { if (event.key === "Escape") setOpen("none"); }}>
          <label className="flows-field">
            <span>What step {step.number} does, in words</span>
            <input type="text" value={words} maxLength={200} autoFocus onChange={(event) => setWords(event.target.value)} />
          </label>
          <button type="submit" className="flows-button" disabled={actions.busy || !words.trim() || words.trim() === step.plainWords}>Save words</button>
          <button type="button" className="flows-tool" onClick={() => setOpen("none")}>Cancel</button>
        </form>
      ) : null}
      {shown && open === "values" && nodeId ? <StepValues number={step.number} nodeId={nodeId} stepKey={step.key} /> : null}
      {shown && open === "add" ? <AddStep after={step.number} at={step.key} onDone={() => setOpen("none")} /> : null}
    </div>
  );
}
