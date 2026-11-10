"use client";

import { useCallback, useState } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { useResource } from "../../home/data";
import { PublishPanelPage } from "../../panel-shell";
import { loadRunRows } from "../data";
import { ANY_RUN_FILTER, filterRuns, flowOptions, type RunFilter } from "../model";
import { RunsFilters } from "./RunsFilters";
import { RunsListRow } from "./RunsListRow";
import "../runs.css";

/** Every run from every client, newest first, filterable by Flow, client and result. */
export function RunsListPage() {
  const studio = useProgramTransport("automation-studio");
  const runs = useResource(useCallback((signal: AbortSignal) => loadRunRows(studio, signal), [studio]));
  const [filter, setFilter] = useState<RunFilter>(ANY_RUN_FILTER);
  const now = Date.now();
  const flowId = filter.flowId === "any" ? undefined : filter.flowId;
  return (
    <div className="runs">
      <PublishPanelPage page="runs" selection={flowId ? { flowId } : {}} />
      <h1>Runs</h1>
      {runs.state === "loading" ? <p className="runs-note" role="status">Loading your runs…</p> : null}
      {runs.state === "error" ? <p className="runs-note runs-error" role="alert">Could not read your runs. Check that the engine is running, then reload.</p> : null}
      {runs.state === "ready" ? (() => {
        const shown = filterRuns(runs.data.rows, filter);
        return (
          <>
            {runs.data.incomplete ? <p className="runs-note" role="status">Some projects could not be read, so this list may be missing runs.</p> : null}
            {runs.data.rows.length === 0 ? <p className="runs-note">No runs yet. When a Flow runs, from any client, it shows up here.</p> : (
              <>
                <RunsFilters filter={filter} flows={flowOptions(runs.data.rows)} onChange={setFilter} />
                {shown.length === 0 ? <p className="runs-note">No runs match these filters.</p> : (
                  <ul className="runs-list" aria-label="Runs">
                    {shown.map((row) => <RunsListRow key={row.runId} row={row} now={now} />)}
                  </ul>
                )}
              </>
            )}
          </>
        );
      })() : null}
    </div>
  );
}
