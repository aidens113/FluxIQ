"use client";

import Link from "next/link";
import { formatSpend } from "../../panel-shell";
import type { HomeRuns, Resource } from "../data";
import { agoText, recentRuns, runDuration, runResult } from "../model";
import { HomeSection } from "./HomeSection";

export function HomeRecentRuns(props: { runs: Resource<HomeRuns>; now: number }) {
  return (
    <HomeSection
      id="recent-runs"
      title="Recent runs"
      resource={props.runs}
      errorText="Could not read your runs."
      emptyText="No runs yet."
      isEmpty={(data) => data.runs.length === 0}
      action={<Link className="home-link" href="/runs" aria-label="See all runs">All runs</Link>}
      render={(data) => (
        <ul className="home-list" aria-label="Recent runs">
          {recentRuns(data.runs).map((run) => {
            const result = runResult(run.status);
            const took = runDuration(run);
            return (
              <li key={run.runId} className="home-row">
                <Link className="home-row-main home-link" href={`/runs/${encodeURIComponent(run.runId)}`} aria-label={`Open the run of ${run.flowName}: ${result.label}`}>
                  <span className="home-state" data-tone={result.tone}>{result.label}</span> {run.flowName}
                </Link>
                <span className="home-row-side home-muted">
                  {run.costUsd === undefined ? "cost not recorded" : formatSpend(run.costUsd)} · {agoText(run.startedAt, props.now)}{took ? ` · took ${took}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    />
  );
}
