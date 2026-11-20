"use client";

import Link from "next/link";
import type { Resource } from "../data";
import { connectedGroups, NO_REVOKED, type ConnectedRow, type HomeClient, type RevokedAccess } from "../model";
import { HomeSection } from "./HomeSection";

function Rows(props: { label: string; rows: ConnectedRow[] }) {
  return (
    <ul className="home-list" aria-label={props.label}>
      {props.rows.map((row) => (
        <li key={row.key} className="home-row">
          <span className="home-row-main">
            <strong>{row.name}</strong>
            <span className="home-muted">{row.kind}{row.attempts > 1 ? ` · asked ${row.attempts} times` : ""}</span>
          </span>
          <span className="home-row-side">
            <span className="home-state" data-tone={row.tone}>{row.state}</span>
            {row.lastSeen && row.tone !== "ok" ? <span className="home-muted">last seen {row.lastSeen}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The browsers and apps that can use this FluxIQ, with a link to approve the ones waiting to connect. `waiting` comes live
 * from the client gateway; `revoked` is who had access removed, so their old rows are not listed.
 */
export function HomeConnected(props: { clients: Resource<HomeClient[]>; waiting: number; now: number; revoked?: RevokedAccess }) {
  const revoked = props.revoked ?? NO_REVOKED;
  return (
    <HomeSection
      id="connected"
      title="Browsers and apps"
      resource={props.clients}
      action={props.waiting > 0 ? <Link className="home-link" href="/security/devices">{props.waiting === 1 ? "1 waiting to connect" : `${props.waiting} waiting to connect`}</Link> : undefined}
      errorText="Could not read what is connected."
      emptyText="Nothing is connected yet."
      isEmpty={(clients) => {
        const groups = connectedGroups(clients, revoked, props.now);
        return groups.connected.length === 0 && groups.waiting.length === 0;
      }}
      render={(clients) => {
        const { connected, waiting } = connectedGroups(clients, revoked, props.now);
        return (
          <>
            {connected.length > 0 ? <Rows label="Connected browsers and apps" rows={connected} /> : <p className="home-note">None are connected right now.</p>}
            {waiting.length > 0 ? (
              <>
                <h3 className="home-subhead">Waiting for approval</h3>
                <Rows label="Browsers and apps waiting for approval" rows={waiting} />
              </>
            ) : null}
          </>
        );
      }}
    />
  );
}
