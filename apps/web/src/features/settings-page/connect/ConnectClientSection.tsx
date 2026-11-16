"use client";

import { PairedClientsList } from "../../security/access";
import { forgetPairedClient } from "../../security/data";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { CopyField } from "./CopyField";
import { PendingPairings } from "./PendingPairings";
import { useConnectView } from "./use-connect-view";

/** Settings: what a client needs to connect, the requests waiting to pair, and the clients already paired. */
export function ConnectClientSection() {
  const { state, reload } = useConnectView();
  const studio = useProgramTransport("automation-studio");
  return (
    <section aria-labelledby="settings-connect">
      <h2 id="settings-connect">Connect a client</h2>
      {state.state === "loading" ? <p role="status">Loading connection details...</p> : null}
      {state.state === "error" ? (
        <div role="alert">
          <p>Could not read the connection details. Check that the engine is running.</p>
          <button type="button" onClick={reload}>Try again</button>
        </div>
      ) : null}
      {state.state === "ready" ? (
        <>
          <CopyField label="Panel address" value={state.view.info.panelAddress} missing="Unknown" />
          <CopyField label="Gateway address" value={state.view.info.gatewayUrl} missing="The gateway is not switched on." />
          <CopyField label="Discovery data (/.well-known/fluxiq)" value={state.view.info.discoveryText} multiline missing={state.view.discoveryFailed ? "Could not be read. Reload to try again." : "Unavailable"} />
          <h3>Pair the browser extension</h3>
          <ol>
            <li>Open the FluxIQ extension and choose Connect.</li>
            <li>Enter the panel address above, or let the extension find it.</li>
            <li>Approve the request below when its code matches. The extension can then use models straight away.</li>
          </ol>
          <h3>Waiting to pair</h3>
          <PendingPairings requests={state.view.pending} onDone={reload} />
          <h3>Connected clients</h3>
          <PairedClientsList rows={state.view.clients} now={Date.now()} onForget={(id) => forgetPairedClient(studio, id)} onDone={reload} />
        </>
      ) : null}
    </section>
  );
}
