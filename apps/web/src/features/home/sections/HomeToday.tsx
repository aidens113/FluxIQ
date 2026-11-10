"use client";

import { formatSpend } from "../../panel-shell";
import type { HomeRuns, Resource } from "../data";
import { todaySummary } from "../model";
import { HomeSection } from "./HomeSection";

export function HomeToday(props: { runs: Resource<HomeRuns>; now: number }) {
  return (
    <HomeSection
      id="today"
      title="Today"
      resource={props.runs}
      errorText="Could not read today's runs."
      emptyText="No runs yet today."
      isEmpty={(data) => todaySummary(data.runs, props.now).runs === 0 && !data.incomplete}
      render={(data) => {
        const today = todaySummary(data.runs, props.now);
        return (
          <>
            <p className="home-fact">
              {today.runs === 0 ? "No runs yet today." : `${today.runs} ${today.runs === 1 ? "run" : "runs"} · ${today.passed} passed`}
              {today.failed > 0 ? ` · ${today.failed} failed` : ""}
              {today.spendUsd !== null ? ` · ${formatSpend(today.spendUsd)} spent` : ""}
            </p>
            {data.incomplete ? <p className="home-note">Some projects could not be read, so these numbers may be low.</p> : null}
          </>
        );
      }}
    />
  );
}
