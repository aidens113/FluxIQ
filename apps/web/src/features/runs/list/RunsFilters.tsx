"use client";

import type { ChangeEvent } from "react";
import { clientLabel, type ResultGroup, type RunClient, type RunFilter } from "../model";

const CLIENTS: readonly RunClient[] = ["extension", "program", "panel"];
const RESULTS: ReadonlyArray<[ResultGroup, string]> = [["passed", "Passed"], ["failed", "Failed"], ["stopped", "Stopped"], ["running", "Still going"]];

/** The three filters: which Flow, which client, which result. */
export function RunsFilters(props: { filter: RunFilter; flows: ReadonlyArray<{ flowId: string; name: string }>; onChange(filter: RunFilter): void }) {
  const { filter, onChange } = props;
  return (
    <div className="runs-filters" role="group" aria-label="Filter runs">
      <label>
        <span>Flow</span>
        <select aria-label="Flow" value={filter.flowId} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange({ ...filter, flowId: event.target.value })}>
          <option value="any">All Flows</option>
          {props.flows.map((flow) => <option key={flow.flowId} value={flow.flowId}>{flow.name}</option>)}
        </select>
      </label>
      <label>
        <span>Client</span>
        <select aria-label="Client" value={filter.client} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange({ ...filter, client: event.target.value as RunFilter["client"] })}>
          <option value="any">Any client</option>
          {CLIENTS.map((client) => <option key={client} value={client}>{clientLabel(client)}</option>)}
          <option value="unknown">Not recorded</option>
        </select>
      </label>
      <label>
        <span>Result</span>
        <select aria-label="Result" value={filter.result} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange({ ...filter, result: event.target.value as RunFilter["result"] })}>
          <option value="any">Any result</option>
          {RESULTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
  );
}
