"use client";

import { useCallback, useMemo } from "react";
import { useProgramTransport } from "../automation-studio/data/use-program-transport";
import { PublishPanelPage, useEngineReading, usePanelContext, type EngineStatus } from "../panel-shell";
import { useGatewayChanges } from "../client-gateway-changes";
import { pendingPairings } from "../settings-page/connect";
import { readRevokedAccess } from "./model";
import { loadAllRuns, loadClients, loadRuns, loadThreads, useReloadOnChange, useResource, type Resource } from "./data";
import { HomeAiKey, HomeConnected, HomeEngine, HomeNeedsYou, HomeRecentRuns, HomeToday } from "./sections";
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
  // The client gateway's own change stream says when a browser asks to connect, is approved or leaves: read again then, not on a timer.
  const gateway = useGatewayChanges();
  useReloadOnChange(clients, gateway.revision);
  const now = Date.now();
  const revoked = useMemo(() => readRevokedAccess(gateway.snapshot?.trustedClients), [gateway.snapshot]);
  const waiting = pendingPairings(gateway.snapshot?.pairings, now).length;
  return (
    <div className="home">
      <PublishPanelPage page="home" />
      <h1>Home</h1>
      <HomeAiKey />
      <div className="home-grid">
        <HomeEngine engine={engine} />
        <HomeToday runs={runs} now={now} />
        <HomeConnected clients={clients} waiting={waiting} now={now} revoked={revoked} />
        <HomeNeedsYou threads={threads} runs={runs} />
      </div>
      <HomeRecentRuns runs={runs} now={now} />
    </div>
  );
}
