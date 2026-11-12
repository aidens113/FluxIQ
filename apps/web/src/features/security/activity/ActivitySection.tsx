"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Guarded } from "../model";
import { ActivityList } from "./ActivityList";
import { loadActivity } from "./data";
import type { ActivityEntry, ActivityPage } from "./model";
import "./activity.css";

/** What the section shows: loading, no access, could not read, or the entries so far and where the next page starts. */
export type ActivityState =
  | { state: "loading" }
  | { state: "denied" }
  | { state: "error" }
  | { state: "ready"; entries: ActivityEntry[]; next: string | null; more: "idle" | "loading" | "error" };

type Load = (cursor: string | null, signal?: AbortSignal) => Promise<Guarded<ActivityPage>>;

function readyOrDenied(answer: Guarded<ActivityPage>, before: ActivityEntry[]): ActivityState {
  if (answer.state === "denied") return { state: "denied" };
  return { state: "ready", entries: [...before, ...answer.data.entries], next: answer.data.next, more: "idle" };
}

/**
 * The workspace's activity for its owner or an administrator: who did what,
 * whether it was allowed, to what and when, newest first, with "Load more"
 * for older entries. Anyone else is told they have no access; the server
 * decides that (and records it), the screen only says so. It asks once when
 * the page opens, so a refused person is not refused again every few
 * seconds; reloading the page asks again.
 */
export function ActivitySection(props: { load?: Load; now?: () => number }) {
  const [view, setView] = useState<ActivityState>({ state: "loading" });
  const load = useRef<Load>(props.load ?? loadActivity);
  load.current = props.load ?? loadActivity;

  useEffect(() => {
    const controller = new AbortController();
    const ask = async () => {
      try {
        const answer = await load.current(null, controller.signal);
        if (!controller.signal.aborted) setView(readyOrDenied(answer, []));
      } catch {
        if (!controller.signal.aborted) setView({ state: "error" });
      }
    };
    void ask();
    return () => controller.abort();
  }, []);

  const loadMore = useCallback(async () => {
    if (view.state !== "ready" || view.next === null || view.more === "loading") return;
    const current = view;
    setView({ ...current, more: "loading" });
    try {
      setView(readyOrDenied(await load.current(current.next), current.entries));
    } catch {
      setView({ ...current, more: "error" });
    }
  }, [view]);

  return (
    <section className="security-section" aria-labelledby="security-activity">
      <h2 id="security-activity">Activity</h2>
      <ActivityBody view={view} now={(props.now ?? Date.now)()} onMore={() => void loadMore()} />
    </section>
  );
}

function ActivityBody(props: { view: ActivityState; now: number; onMore: () => void }) {
  const { view } = props;
  if (view.state === "loading") return <p className="security-note" role="status">Loading activity…</p>;
  if (view.state === "denied") return <p className="security-note" role="status">You do not have access to this.</p>;
  if (view.state === "error") return <p className="security-note security-error" role="alert">Could not read the activity. Check that the engine is running, then reload.</p>;
  const empty = view.entries.length === 0 && view.next === null;
  return (
    <>
      {empty ? <p className="security-note">Nothing has been recorded yet.</p> : <ActivityList entries={view.entries} now={props.now} />}
      {view.next !== null ? (
        <button type="button" className="activity-more" disabled={view.more === "loading"} onClick={props.onMore}>{view.more === "loading" ? "Loading…" : "Load more"}</button>
      ) : empty ? null : <p className="security-note">That is everything recorded.</p>}
      {view.more === "error" ? <p className="security-note security-error" role="alert">Could not read more activity. Try again.</p> : null}
    </>
  );
}
