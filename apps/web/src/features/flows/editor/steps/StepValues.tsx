"use client";

import { useCallback } from "react";
import { loadStepNode } from "../../data";
import { stepValues } from "../../model";
import { useLoaded } from "../../use-loaded";
import { useStepActions } from "./step-actions";
import { ValueField } from "./ValueField";

/**
 * The values of one step a person can change in place: type a new value, or have it read one of
 * the Flow's inputs instead. What the step acts on is not here: FluxIQ finds that live.
 */
export function StepValues(props: { number: string; nodeId: string; stepKey: string }) {
  const actions = useStepActions();
  const { studio, flow } = actions;
  const node = useLoaded(`${flow.flowId}:${props.nodeId}`, useCallback((signal: AbortSignal) => loadStepNode(studio, flow, props.nodeId, signal), [studio, flow, props.nodeId]));
  if (node.state === "loading") return <p className="flows-note">Reading this step’s values…</p>;
  if (node.state === "error") return <p className="flows-note flows-error">This step’s values could not be read: {node.message}</p>;
  const values = stepValues(node.data);
  if (!values.length) return <p className="flows-note">Step {props.number} has no values to type in. Ask FluxIQ to change what it does.</p>;
  return (
    <ul className="flows-values" aria-label={`Values of step ${props.number}`}>
      {values.map((value) => <ValueField key={value.path.join(".")} value={value} number={props.number} stepKey={props.stepKey} onSaved={node.reload} />)}
    </ul>
  );
}
