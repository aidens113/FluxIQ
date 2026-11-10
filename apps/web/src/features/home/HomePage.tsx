"use client";

import { useCallback } from "react";
import { useProgramTransport } from "../automation-studio/data/use-program-transport";
import { PublishPanelPage } from "../panel-shell";
import { loadClients, loadEngine, loadRuns, loadThreads, useResource } from "./data";
import { HomeConnected, HomeEngine, HomeNeedsYou, HomeRecentRuns, HomeToday } from "./sections";
import "./home.css";

/** The panel's Home: how the engine is, what is connected, what needs the person, and the latest runs. */
export function HomePage() {
  const studio = useProgramTransport("automation-studio");
  const runtime = useProgramTransport("runtime");
  const engine = useResource(loadEngine);
  const runs = useResource(useCallback((signal: AbortSignal) => loadRuns(studio, signal), [studio]));
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
