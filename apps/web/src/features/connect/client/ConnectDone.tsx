"use client";

import { useEffect, useState } from "react";
import { describeConnectHandoff, type ConnectHandoffStatus } from "./handoff";

/** Keep the fragment available for the extension-owned tab observer; never render, persist or postMessage it. */
export function ConnectDone({ origin }: { origin: string }) {
  const [status, setStatus] = useState<ConnectHandoffStatus | "checking">("checking");
  useEffect(() => {
    setStatus(describeConnectHandoff(window.location.href, origin));
  }, [origin]);
  if (status === "checking") return <p role="status">Checking browser connection…</p>;
  if (status === "ready") return <p role="status">Return to the FluxIQ extension to finish connecting. It will close this tab when it has received your connection.</p>;
  if (status === "declined") return <p role="status">This browser was not connected. You can close this tab.</p>;
  return <p role="alert">This connection could not be completed. Start a new connection from the FluxIQ extension.</p>;
}
