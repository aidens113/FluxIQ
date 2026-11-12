"use client";

import type { ChangeEvent } from "react";
import type { DatasetFilter } from "../model";

/** The two filters: which Flow, and a text search. */
export function DataFilters(props: { filter: DatasetFilter; flows: ReadonlyArray<{ flowId: string; name: string }>; onChange(filter: DatasetFilter): void }) {
  const { filter, onChange } = props;
  return (
    <div className="data-filters" role="group" aria-label="Filter data">
      <label>
        <span>Flow</span>
        <select aria-label="Flow" value={filter.flowId} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange({ ...filter, flowId: event.target.value })}>
          <option value="any">All Flows</option>
          {props.flows.map((flow) => <option key={flow.flowId} value={flow.flowId}>{flow.name}</option>)}
        </select>
      </label>
      <label>
        <span>Search</span>
        <input aria-label="Search" type="search" placeholder="Table or Flow name" value={filter.search} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...filter, search: event.target.value })} />
      </label>
    </div>
  );
}
