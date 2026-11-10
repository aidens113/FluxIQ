"use client";

import { useState } from "react";
import { dataStepFromForm, type DataStepForm } from "../../model";
import type { DataStepDeclaration } from "../../wire";

const CHOICES: ReadonlyArray<readonly [DataStepForm["kind"], string]> = [
  ["keep-where", "Keep rows where…"],
  ["sort", "Sort"],
  ["keep-first", "Keep the first few"],
  ["remove-duplicates", "Remove duplicates"],
  ["save-dataset", "Save to a dataset"],
  ["export", "Export to a file"]
];

/** The short menu of data steps, and the few fields each needs. Calls `onAdd` with the step, or shows why it is not ready. */
export function AddDataStep(props: { disabled: boolean; onAdd(data: DataStepDeclaration): void }) {
  const [kind, setKind] = useState<DataStepForm["kind"]>("keep-where");
  const [field, setField] = useState("");
  const [test, setTest] = useState<"is" | "is-not" | "at-most" | "at-least" | "contains">("is");
  const [value, setValue] = useState("");
  const [order, setOrder] = useState<"lowest" | "highest">("lowest");
  const [count, setCount] = useState("10");
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [path, setPath] = useState("exports/rows.csv");
  const [problem, setProblem] = useState<string>();
  const form = (): DataStepForm => {
    switch (kind) {
      case "keep-where": return { kind, field, test, value };
      case "sort": return { kind, field, order };
      case "keep-first": return { kind, count };
      case "remove-duplicates": return { kind, field };
      case "save-dataset": return { kind, name };
      case "export": return { kind, format, path };
    }
  };
  const add = () => {
    const made = dataStepFromForm(form());
    if (!made.ok) return setProblem(made.reason);
    setProblem(undefined);
    props.onAdd(made.data);
  };
  const needsField = kind === "keep-where" || kind === "sort" || kind === "remove-duplicates";
  return (
    <div className="flows-form">
      <label className="flows-field">
        <span>What should it do?</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as DataStepForm["kind"])}>
          {CHOICES.map(([choice, words]) => <option key={choice} value={choice}>{words}</option>)}
        </select>
      </label>
      {needsField ? (
        <label className="flows-field">
          <span>{kind === "sort" ? "Sort by the field" : kind === "remove-duplicates" ? "Rows are the same when this field matches" : "The field"}</span>
          <input type="text" value={field} onChange={(event) => setField(event.target.value)} placeholder="price" />
        </label>
      ) : null}
      {kind === "keep-where" ? (
        <>
          <label className="flows-field">
            <span>Keep it when it</span>
            <select value={test} onChange={(event) => setTest(event.target.value as typeof test)}>
              <option value="is">is</option>
              <option value="is-not">is not</option>
              <option value="at-most">is at most</option>
              <option value="at-least">is at least</option>
              <option value="contains">contains</option>
            </select>
          </label>
          <label className="flows-field">
            <span>This value</span>
            <input type="text" value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
        </>
      ) : null}
      {kind === "sort" ? (
        <label className="flows-field">
          <span>Order</span>
          <select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>
            <option value="lowest">Lowest first</option>
            <option value="highest">Highest first</option>
          </select>
        </label>
      ) : null}
      {kind === "keep-first" ? (
        <label className="flows-field">
          <span>How many rows to keep</span>
          <input type="number" min={1} value={count} onChange={(event) => setCount(event.target.value)} />
        </label>
      ) : null}
      {kind === "save-dataset" ? (
        <label className="flows-field">
          <span>Dataset name</span>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      ) : null}
      {kind === "export" ? (
        <>
          <label className="flows-field">
            <span>File type</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>
              <option value="csv">CSV (opens in a spreadsheet)</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <label className="flows-field">
            <span>File name in the project</span>
            <input type="text" value={path} onChange={(event) => setPath(event.target.value)} />
          </label>
        </>
      ) : null}
      {problem ? <p className="flows-note flows-error" role="alert">{problem}</p> : null}
      <button type="button" className="flows-button" disabled={props.disabled} onClick={add}>Add this step</button>
    </div>
  );
}
