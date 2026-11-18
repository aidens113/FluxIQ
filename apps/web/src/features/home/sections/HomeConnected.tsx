"use client";

import Link from "next/link";
import type { Resource } from "../data";
import { connectedRows, type HomeClient } from "../model";
import { HomeSection } from "./HomeSection";

/** What is connected, with a link to approve the browsers or apps waiting to connect. `waiting` comes live from the client gateway. */
export function HomeConnected(props: { clients: Resource<HomeClient[]>; waiting: number; now: number }) {
  return (
    <HomeSection
      id="connected"
      title="Connected"
      resource={props.clients}
      action={props.waiting > 0 ? <Link className="home-link" href="/security/devices">{props.waiting === 1 ? "1 waiting to connect" : `${props.waiting} waiting to connect`}</Link> : undefined}
      errorText="Could not read what is connected."
      emptyText="Nothing is connected yet."
      isEmpty={(clients) => clients.length === 0}
      render={(clients) => (
        <ul className="home-list" aria-label="Connected clients and hosts">
          {connectedRows(clients, props.now).map((row) => (
            <li key={row.key} className="home-row">
              <span className="home-row-main">
                <strong>{row.name}</strong>
                <span className="home-muted">{row.kind}</span>
              </span>
              <span className="home-row-side">
                <span className="home-state" data-tone={row.tone}>{row.state}</span>
                <span className="home-muted">last seen {row.lastSeen}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
