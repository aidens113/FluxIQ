"use client";

import { useCallback, useMemo } from "react";
import { useProgramTransport } from "../automation-studio/data/use-program-transport";
import { PublishPanelPage, useEngineReading, usePanelContext, type EngineStatus } from "../panel-shell";
import { loadAllRuns, loadClients, loadRuns, loadThreads, useResource, type Resource } from "./data";
import { HomeConnected, HomeEngine, HomeNeedsYou, HomeRecentRuns, HomeToday } from "./sections";
import "./home.css";

/** The panel's Home: how the engine is, what is connected, what needs the person, and the latest runs. */
export function HomePage() {
  const studio = useProgramTransport("automation-studio");
  const runtime = useProgramTransport("runtime");
  const { context } = usePanelContext();
  const projectId = context.projectId;
  const reading = useEngineReading();
  const engine = useMemo<Resource<EngineStatus>>(
    () => (reading.loaded ? { state: "ready", data: reading.status } : { state: "loading" }),
    [reading]
  );
  // The project in view, or every project the person may read: Core answers that in two requests, with no project list asked first.
  const runs = useResource(
    useCallback((signal: AbortSignal) => (projectId ? loadRuns(studio, [projectId], signal) : loadAllRuns(studio, signal)), [studio, projectId]),
    { key: projectId ?? "all" }
  );
  const threads = useResource(useCallback((signal: AbortSignal) => loadThreads(studio, signal), [studio]));
  const clients = useResource(useCallback((signal: AbortSignal) => loadClients(runtime, signal), [runtime]));
  const now = Date.now();
  return (
    <div className="home">
      <PublishPanelPage page="home" />
      <h1>Home</h1>
      <div className="home-grid">
        <HomeEngine engine={engine} />
        <HomeToday runs={runs} now={now} />
        <HomeConnected clients={clients} now={now} />
        <HomeNeedsYou threads={threads} runs={runs} />
      </div>
      <HomeRecentRuns runs={runs} now={now} />
    </div>
  );
}
