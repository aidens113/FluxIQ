"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { RunDetailView } from "../../automation-studio/runtime";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { useResource } from "../../home/data";
import { PublishPanelPage } from "../../panel-shell";
import { loadRunRows } from "../data";
import { runHeadline } from "../model";
import "../runs.css";

/**
 * One run: its answer in a line, then the existing run detail (what happened step by step, the action log
 * with each action's page state, and the evidence). The run's project is found from the run list, since the
 * address names only the run.
 */
export function RunPage(props: { runId: string }) {
  const router = useRouter();
  const studio = useProgramTransport("automation-studio");
  const runs = useResource(useCallback((signal: AbortSignal) => loadRunRows(studio, signal), [studio]));
  const row = runs.state === "ready" ? runs.data.rows.find((candidate) => candidate.runId === props.runId) : undefined;
  return (
    <div className="runs">
      <PublishPanelPage page="runs" selection={row ? { runId: props.runId, flowId: row.flowId } : { runId: props.runId }} />
      <p className="runs-crumb"><Link className="runs-link" href="/runs">All runs</Link></p>
      <h1>{row ? runHeadline(row) : "Run"}</h1>
      {runs.state === "loading" ? <p className="runs-note" role="status">Loading this run…</p> : null}
      {runs.state === "error" ? <p className="runs-note runs-error" role="alert">Could not read this run. Check that the engine is running, then reload.</p> : null}
      {runs.state === "ready" && !row ? <p className="runs-note">This run was not found. It may have been deleted. <Link className="runs-link" href="/runs">See all runs</Link></p> : null}
      {row ? (
        <div className="runs-detail">
          <RunDetailView projectId={row.projectId} runId={row.runId} runDetail={null} loading={false} error="" onBack={() => router.push("/runs")} />
        </div>
      ) : null}
    </div>
  );
}
