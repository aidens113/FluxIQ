"use client";

import { PairedClientsList } from "../../security/access";
import { forgetPairedClient } from "../../security/data";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { CopyField } from "./CopyField";
import { PendingPairings } from "./PendingPairings";
import { useConnectView } from "./use-connect-view";
import "./devices.css";

/**
 * Devices and apps: requests waiting to connect first, the browsers and apps
 * already connected (removed ones folded away), how to connect another, and
 * the technical addresses behind "Technical details".
 */
export function ConnectClientSection() {
  const { state, reload, live } = useConnectView();
  const studio = useProgramTransport("automation-studio");
  return (
    // The Security tab already says "Devices and apps"; a second heading under it would only repeat it.
    <section aria-label="Devices and apps" className="devices">
      {state.state === "loading" ? <p role="status">Loading your devices…</p> : null}
      {state.state === "error" ? (
        <div role="alert">
          <p>Could not read your devices. Check that the engine is running.</p>
          <button type="button" className="button" onClick={reload}>Try again</button>
        </div>
      ) : null}
      {state.state === "ready" ? (
        <>
          {live === "reconnecting" ? <p role="status" className="devices-muted">Live updates dropped and are reconnecting. This page is read again as soon as they are back.</p> : null}
          {live === "closed" ? (
            <p role="status" className="devices-muted">Live updates are off, so this page may be out of date. <button type="button" className="button" onClick={reload}>Reconnect</button></p>
          ) : null}
          <h3>Waiting for your approval</h3>
          <PendingPairings requests={state.view.pending} onDone={reload} />
          <h3>Connected browsers and apps</h3>
          <PairedClientsList rows={state.view.clients} now={Date.now()} onForget={(id) => forgetPairedClient(studio, id)} onDone={reload} />
          <h3>Connect another browser</h3>
          <ol className="devices-steps">
            <li>Open the FluxIQ extension and choose Connect.</li>
            <li>Type this address when it asks, or let the extension find it.</li>
            <li>Approve the request here when its code matches the one the extension shows.</li>
          </ol>
          <CopyField label="This panel's address" value={state.view.info.panelAddress} missing="Unknown" />
          <details className="devices-technical">
            <summary>Technical details</summary>
            <CopyField label="Connection address" value={state.view.info.gatewayUrl} missing="Connections are not switched on." />
            <CopyField label="Discovery data (/.well-known/fluxiq)" value={state.view.info.discoveryText} multiline missing={state.view.discoveryFailed ? "Could not be read. Reload to try again." : "Unavailable"} />
          </details>
        </>
      ) : null}
    </section>
  );
}
