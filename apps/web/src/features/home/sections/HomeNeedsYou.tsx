"use client";

import Link from "next/link";
import type { HomeRuns, Resource } from "../data";
import { needsYouItems, type HomeThread } from "../model";
import { HomeSection } from "./HomeSection";

/** Waiting questions and Flows that keep failing. It needs both reads: if either could not be read it says so rather than showing half. */
export function HomeNeedsYou(props: { threads: Resource<HomeThread[]>; runs: Resource<HomeRuns> }) {
  const { threads, runs } = props;
  const combined: Resource<{ threads: HomeThread[]; runs: HomeRuns }> =
    threads.state === "error" || runs.state === "error" ? { state: "error" }
      : threads.state === "ready" && runs.state === "ready" ? { state: "ready", data: { threads: threads.data, runs: runs.data } }
        : { state: "loading" };
  return (
    <HomeSection
      id="needs-you"
      title="Needs you"
      resource={combined}
      errorText="Could not check what needs you."
      emptyText="Nothing needs you right now."
      isEmpty={(data) => needsYouItems(data.threads, data.runs.runs, data.runs.flowNames).length === 0}
      render={(data) => (
        <ul className="home-list" aria-label="Things that need you">
          {needsYouItems(data.threads, data.runs.runs, data.runs.flowNames).map((item) => (
            <li key={item.key} className="home-row">
              <span className="home-row-main">{item.text}</span>
              <Link className="home-link" href={item.href} aria-label={item.openLabel}>Open</Link>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
