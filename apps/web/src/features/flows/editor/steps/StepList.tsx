"use client";

import type { StepView } from "../../model";
import { StepTools } from "./StepTools";
import { StepWords } from "./StepWords";
import { useStepActions } from "./step-actions";

/** A block of steps: the Flow's own, or the ones a step holds. The numbers are the steps' own, so the list draws none. */
export function StepList(props: { steps: readonly StepView[]; label: string }) {
  return (
    <ol className="flows-steps" aria-label={props.label}>
      {props.steps.map((step) => <StepRow key={step.key} step={step} />)}
    </ol>
  );
}

/** One step: its number (press it to pick the step for the assistant), its words, what can be done to it, and the steps it holds. */
function StepRow(props: { step: StepView }) {
  const actions = useStepActions();
  const { step } = props;
  const picked = actions.selected.has(step.key);
  const refusal = actions.refusal?.at === step.key ? actions.refusal.reason : undefined;
  return (
    <li className="flows-step" data-kind={step.kind} data-changed={step.changed || undefined} data-picked={picked || undefined}>
      <div className="flows-step-line">
        {step.number ? (
          <button type="button" className="flows-step-number" aria-pressed={picked} aria-label={`Step ${step.number}: ${step.plainWords}. ${picked ? "Picked" : "Pick it"} for the assistant`} onClick={() => actions.toggleSelected(step.key)}>
            {step.number}
          </button>
        ) : null}
        {step.number ? <StepWords step={step} /> : <strong className="flows-step-heading"><StepWords step={step} /></strong>}
      </div>
      {step.editable ? <StepTools step={step} /> : null}
      {refusal ? <p className="flows-refusal" role="alert">Not saved: {refusal}</p> : null}
      {step.children.length ? <StepList steps={step.children} label={`Inside step ${step.number}`} /> : null}
      {step.arms.map((arm, index) => (
        <div key={index} className="flows-arm">
          <span className="flows-arm-words">{arm.words}</span>
          <StepList steps={arm.steps} label={arm.words} />
        </div>
      ))}
    </li>
  );
}
