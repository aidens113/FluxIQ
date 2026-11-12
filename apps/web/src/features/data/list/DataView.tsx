"use client";

import { useState } from "react";
import type { Resource } from "../../home/data";
import type { DatasetRows } from "../data";
import { ANY_DATASET_FILTER, datasetFlowOptions, filterDatasets, type DatasetFilter, type DatasetRow } from "../model";
import { DataFilters } from "./DataFilters";
import { DatasetDetail } from "./DatasetDetail";
import { DatasetsListRow } from "./DatasetsListRow";
import "../data.css";

const keyOf = (row: DatasetRow) => `${row.projectId}/${row.flowId}/${row.datasetId}`;

/** The Data screen for one load state: loading, error, empty, or the tables with their filters and the open table. */
export function DataView(props: { tables: Resource<DatasetRows>; now: number }) {
  const [filter, setFilter] = useState<DatasetFilter>(ANY_DATASET_FILTER);
  const [openKey, setOpenKey] = useState<string | undefined>();
  const { tables } = props;
  return (
    <div className="data">
      <h1>Data</h1>
      <p className="data-muted">The data your Flows collected, ready to look through and export.</p>
      {tables.state === "loading" ? <p className="data-note" role="status">Loading your data…</p> : null}
      {tables.state === "error" ? <p className="data-note data-error" role="alert">Could not read your data. Check that the engine is running, then reload.</p> : null}
      {tables.state === "ready" ? (() => {
        const shown = filterDatasets(tables.data.rows, filter);
        const open = tables.data.rows.find((row) => keyOf(row) === openKey);
        return (
          <>
            {tables.data.incomplete ? <p className="data-note" role="status">Some projects could not be read, so this list may be missing data.</p> : null}
            {tables.data.rows.length === 0 ? <p className="data-note">No data yet. When a Flow collects rows, they show up here.</p> : (
              <>
                <DataFilters filter={filter} flows={datasetFlowOptions(tables.data.rows)} onChange={setFilter} />
                {shown.length === 0 ? <p className="data-note">No data matches these filters.</p> : (
                  <ul className="data-list" aria-label="Data">
                    {shown.map((row) => <DatasetsListRow key={keyOf(row)} row={row} now={props.now} selected={keyOf(row) === openKey} onOpen={() => setOpenKey(keyOf(row))} />)}
                  </ul>
                )}
                {open ? <DatasetDetail key={keyOf(open)} dataset={open} onClose={() => setOpenKey(undefined)} /> : null}
              </>
            )}
          </>
        );
      })() : null}
    </div>
  );
}
