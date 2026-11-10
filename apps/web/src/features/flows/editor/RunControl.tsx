"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { runInputs } from "../model";
import type { OutlinePort } from "../wire";
import type { RunState } from "./use-run";

/**
 * The Run button, the Flow's inputs when it needs some, and where the run is. Running is never
 * gated by a PIN; what a run may do is the Flow's own declared scope.
 */
export function RunControl(props: { run: RunState; needs: readonly OutlinePort[]; ask(): void; cancel(): void; start(inputs: Record<string, unknown>): void }) {
  const { run, needs } = props;
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const press = () => {
    if (needs.length) props.ask();
    else props.start({});
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const read = runInputs(needs, typed);
    if (!read.ok) return setProblem(read.reason);
    setProblem(undefined);
    props.start(read.inputs);
  };
  const runLink = (runId: string, words: string) => <Link href={`/runs/${encodeURIComponent(runId)}`}>{words}</Link>;
  return (
    <div className="flows-run-control">
      <button type="button" className="flows-button flows-primary" disabled={run.state === "running"} onClick={press}>
        {run.state === "running" ? "Running…" : "▶ Run"}
      </button>
      {run.state === "asking" ? (
        <form className="flows-form" aria-label="What this run needs" onSubmit={submit}>
          {needs.map((port) => (
            <label key={port.id} className="flows-field">
              <span>{port.name} ({port.type}){port.required ? "" : ", optional"}</span>
              <input type={port.type === "number" ? "number" : "text"} value={typed[port.id] ?? ""} onChange={(event) => setTyped((was) => ({ ...was, [port.id]: event.target.value }))} />
            </label>
          ))}
          {problem ? <p className="flows-note flows-error" role="alert">{problem}</p> : null}
          <button type="submit" className="flows-button flows-primary">Run now</button>
          <button type="button" className="flows-tool" onClick={props.cancel}>Cancel</button>
        </form>
      ) : null}
      <p className="flows-note" role="status">
        {run.state === "running" ? <>Running the whole Flow. {runLink(run.runId, "Watch it in Runs")}</> : null}
        {run.state === "ended" ? <>The run ended: {run.label}. {runLink(run.runId, "See what it did")}</> : null}
        {run.state === "lost" ? <>This page stopped waiting for the run; it may still be going. {runLink(run.runId, "Open it in Runs")}</> : null}
        {run.state === "refused" ? <>The Flow could not be run: {run.reason}{run.runId ? <> {runLink(run.runId, "See the run")}</> : null}</> : null}
      </p>
    </div>
  );
}
