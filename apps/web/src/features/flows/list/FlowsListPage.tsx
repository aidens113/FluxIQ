"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { PublishPanelPage, usePanelContext } from "../../panel-shell";
import { loadFlowListing } from "../data";
import { listedFlows } from "../model";
import { useLoaded } from "../use-loaded";
import "../flows.css";

/** The project's Flows: search them, open one, and see how each last ran. */
export function FlowsListPage() {
  const studio = useProgramTransport("automation-studio");
  const { context } = usePanelContext();
  const projectId = context.projectId ?? null;
  const [search, setSearch] = useState("");
  const listing = useLoaded(projectId, useCallback((signal: AbortSignal) => loadFlowListing(studio, projectId ?? "", signal), [studio, projectId]));
  const rows = listing.state === "ready" && projectId ? listedFlows(listing.data.flows, listing.data.runs ?? [], search, projectId, Date.now()) : [];
  return (
    <div className="flows">
      <PublishPanelPage page="flows" />
      <h1>Flows</h1>
      {projectId === null ? (
        <p className="flows-note">Choose a project in the top bar to see its Flows.</p>
      ) : (
        <section className="flows-list" aria-label="Flows in this project" aria-busy={listing.state === "loading"}>
          <label className="flows-search">
            <span>Search</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a Flow by name or what it does" />
          </label>
          {listing.state === "loading" ? <p className="flows-note">Loading the Flows…</p> : null}
          {listing.state === "error" ? (
            <p className="flows-note flows-error" role="alert">
              The Flows could not be loaded: {listing.message} <button type="button" onClick={listing.reload}>Try again</button>
            </p>
          ) : null}
          {listing.state === "ready" && listing.data.runs === undefined ? <p className="flows-note">How each Flow last ran could not be read.</p> : null}
          {listing.state === "ready" && rows.length === 0 ? (
            <p className="flows-note">{listing.data.flows.length === 0 ? "This project has no Flows yet. Ask FluxIQ to make one." : "No Flow matches that search."}</p>
          ) : null}
          {rows.length ? (
            <ul className="flows-rows">
              {rows.map((row) => (
                <li key={row.flowId} className="flows-row">
                  <div className="flows-row-main">
                    <Link className="flows-row-name" href={row.href}>{row.name}</Link>
                    {row.description ? <span className="flows-muted">{row.description}</span> : null}
                  </div>
                  <div className="flows-row-side">
                    {row.lastRun ? (
                      <Link className="flows-run" data-tone={row.lastRun.tone} href={row.lastRun.runHref} aria-label={`Last run of ${row.name}: ${row.lastRun.label}, ${row.lastRun.ago}`}>
                        {row.lastRun.label} · {row.lastRun.ago}
                      </Link>
                    ) : (
                      <span className="flows-muted">Not run yet</span>
                    )}
                    <Link className="flows-button" href={row.href} aria-label={`Open ${row.name}`}>Open</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}
    </div>
  );
}
