"use client";

import { VisualAlert } from "../components";

export function OperationalFreshness(props: { loading: boolean; error: string; paused: boolean; stale: boolean; lastSuccessAt: number | null; refresh(): Promise<void> }) {
  return <div aria-live="polite" aria-busy={props.loading}>
    <p>{props.lastSuccessAt === null ? "No operational snapshot confirmed yet." : `Snapshot loaded at ${new Date(props.lastSuccessAt).toLocaleTimeString()}. Displayed ages are estimates from the sampled state.`}</p>
    {props.paused ? <p role="status">Updates paused while this tab is hidden. Current server state is not confirmed.</p> : null}
    {props.loading ? <p role="status">Checking current operational state.</p> : null}
    {props.error ? <VisualAlert tone="error" title="Operational refresh failed" message={props.error} /> : null}
    {props.stale ? <p role="status">Displayed snapshot is stale. Health and timing estimates may not reflect current server state.</p> : null}
    {props.error || props.stale ? <button type="button" className="button" onClick={() => void props.refresh()}>Retry operational refresh</button> : null}
  </div>;
}
