"use client";

import { useState } from "react";
import type { StepValue } from "../../model";
import { useStepActions } from "./step-actions";

/** One value of a step: type a new one, or have it read one of the Flow's inputs, then save. */
export function ValueField(props: { value: StepValue; number: string; stepKey: string; onSaved(): void }) {
  const actions = useStepActions();
  const { value } = props;
  const [text, setText] = useState(value.text);
  const [input, setInput] = useState(value.input ?? "");
  const save = async () => {
    const saved = input
      ? await actions.edit({ kind: "bind-input", step: props.number, path: value.path, input }, props.stepKey)
      : await actions.edit({ kind: "set-value", step: props.number, path: value.path, value: typed(value, text) }, props.stepKey);
    if (saved) props.onSaved();
  };
  const unchanged = input ? input === value.input : value.input === undefined && text === value.text;
  return (
    <li className="flows-value">
      <label className="flows-field">
        <span>{value.label}</span>
        {value.kind === "yes-no" ? (
          <select value={text} disabled={Boolean(input)} onChange={(event) => setText(event.target.value)}>
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        ) : (
          <input type={value.kind === "number" ? "number" : "text"} value={input ? `{${input}}` : text} disabled={Boolean(input)} onChange={(event) => setText(event.target.value)} />
        )}
      </label>
      {actions.needs.length ? (
        <label className="flows-field">
          <span>Or use an input</span>
          <select value={input} onChange={(event) => setInput(event.target.value)}>
            <option value="">No, use the value typed</option>
            {actions.needs.map((port) => <option key={port.id} value={port.id}>{`{${port.id}}`} {port.name}</option>)}
          </select>
        </label>
      ) : null}
      <button type="button" className="flows-button" disabled={actions.busy || unchanged} onClick={() => void save()}>
        Save {value.label.toLowerCase()}
      </button>
    </li>
  );
}

function typed(value: StepValue, text: string): unknown {
  if (value.kind === "yes-no") return text === "yes";
  if (value.kind === "number" && Number.isFinite(Number(text)) && text.trim()) return Number(text);
  return text;
}
