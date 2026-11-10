"use client";

import { useEffect, useRef, useState } from "react";
import type { DataStepDeclaration, FlowSummary } from "../../wire";
import { AddDataStep } from "./AddDataStep";
import { useStepActions } from "./step-actions";

/**
 * Adding a step: "Run another Flow" from the project's Flows, or a data step from the short menu.
 * A step that acts on a site is not typed here: ask FluxIQ, which finds it live.
 */
export function AddStep(props: { after?: string; at: string; onDone?(): void }) {
  const actions = useStepActions();
  const [kind, setKind] = useState<"call" | "data">("call");
  const [flows, setFlows] = useState<{ state: "idle" | "loading" } | { state: "error"; message: string } | { state: "ready"; flows: FlowSummary[] }>({ state: "idle" });
  const [picked, setPicked] = useState("");
  const asked = useRef(false);
  const { otherFlows } = actions;
  useEffect(() => {
    if (kind !== "call" || asked.current) return;
    asked.current = true;
    setFlows({ state: "loading" });
    otherFlows().then(
      (found) => setFlows({ state: "ready", flows: found }),
      (error: unknown) => setFlows({ state: "error", message: error instanceof Error ? error.message : String(error) })
    );
  }, [kind, otherFlows]);
  const where = props.after ? { after: props.after } : {};
  const addCall = async () => {
    const flow = flows.state === "ready" ? flows.flows.find((candidate) => candidate.flowId === picked) : undefined;
    if (!flow) return;
    if (await actions.edit({ kind: "add-call", ...where, flow: { flowId: flow.flowId, name: flow.name } }, props.at)) props.onDone?.();
  };
  const addData = async (data: DataStepDeclaration) => {
    if (await actions.edit({ kind: "add-data", ...where, data }, props.at)) props.onDone?.();
  };
  return (
    <div className="flows-add">
      <fieldset className="flows-choice">
        <legend>Add</legend>
        <label><input type="radio" name={`add-${props.at}`} checked={kind === "call"} onChange={() => setKind("call")} /> Run another Flow</label>
        <label><input type="radio" name={`add-${props.at}`} checked={kind === "data"} onChange={() => setKind("data")} /> A data step</label>
      </fieldset>
      {kind === "call" ? (
        <div className="flows-form">
          {flows.state === "loading" ? <p className="flows-note">Loading the project’s Flows…</p> : null}
          {flows.state === "error" ? <p className="flows-note flows-error">The project’s Flows could not be loaded: {flows.message}</p> : null}
          {flows.state === "ready" && flows.flows.length === 0 ? <p className="flows-note">This project has no other Flow to run.</p> : null}
          {flows.state === "ready" && flows.flows.length ? (
            <>
              <label className="flows-field">
                <span>Which Flow?</span>
                <select value={picked} onChange={(event) => setPicked(event.target.value)}>
                  <option value="">Choose a Flow</option>
                  {flows.flows.map((flow) => <option key={flow.flowId} value={flow.flowId}>{flow.name}</option>)}
                </select>
              </label>
              <button type="button" className="flows-button" disabled={actions.busy || !picked} onClick={() => void addCall()}>Add this step</button>
            </>
          ) : null}
        </div>
      ) : (
        <AddDataStep disabled={actions.busy} onAdd={(data) => void addData(data)} />
      )}
      <p className="flows-note">To add a step that does something on a site, ask FluxIQ: it finds it live.</p>
    </div>
  );
}
