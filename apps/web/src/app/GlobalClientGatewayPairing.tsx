"use client";

import { QrCode } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

type ClientGatewaySnapshot = {
  sessions?: Array<{ sessionId: string; clientId?: string; name?: string }>;
  pairings?: Array<{
    pairingCode: string;
    referenceCode?: string;
    requestedBySessionId?: string;
    requestedByClientId?: string;
    requestedByClientName?: string;
    expiresAt: number;
    consumedAt?: number;
  }>;
  webRuntime?: {
    clientGatewayPublicUrl?: string | null;
    clientGatewayListening?: boolean;
    clientGatewayError?: string | null;
  };
};

export function GlobalClientGatewayPairing() {
  const [snapshot, setSnapshot] = useState<ClientGatewaySnapshot>({});
  const [dismissedCodes, setDismissedCodes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const response = await fetch("/api/client-gateway/snapshot", { cache: "no-store" }).catch(() => null);
      if (!response) return;
      if (response.status === 401) return;
      const result = await response.json().catch(() => undefined) as { ok?: boolean; payload?: ClientGatewaySnapshot } | undefined;
      if (!cancelled && result?.ok) setSnapshot(result.payload ?? {});
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const pendingPairing = useMemo(() => (snapshot.pairings ?? []).find((pairing) =>
    pairing.requestedBySessionId
    && !pairing.consumedAt
    && pairing.expiresAt > Date.now()
    && !dismissedCodes.includes(pairing.pairingCode)
  ), [dismissedCodes, snapshot.pairings]);
  const pendingSession = (snapshot.sessions ?? []).find((session) => session.sessionId === pendingPairing?.requestedBySessionId);

  if (!pendingPairing) return null;

  const removePairingFromUi = (pairingCode: string) => {
    setDismissedCodes((codes) => [...codes, pairingCode]);
    setSnapshot((current) => ({
      ...current,
      pairings: (current.pairings ?? []).filter((pairing) => pairing.pairingCode !== pairingCode)
    }));
  };

  const approve = async () => {
    const pairingCode = pendingPairing.pairingCode;
    removePairingFromUi(pairingCode);
    await fetch("/api/client-gateway/approve-pairing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode })
    }).catch(() => undefined);
  };

  const dismiss = async () => {
    const pairingCode = pendingPairing.pairingCode;
    removePairingFromUi(pairingCode);
    await fetch("/api/client-gateway/dismiss-pairing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode })
    }).catch(() => undefined);
  };

  return (
    <GlobalModal title="Client Pairing Request" onClose={() => void dismiss()}>
      <div className="automation-client-pairing-modal">
        <QrCode size={20} aria-hidden />
        <strong>{pendingPairing.requestedByClientName ?? pendingSession?.name ?? "Extension client"}</strong>
        <span>Approve this client if the reference shown here matches the client.</span>
        <code>{pendingPairing.referenceCode ?? pendingPairing.pairingCode}</code>
        <small>{pendingSession?.clientId ?? pendingPairing.requestedByClientId ?? snapshot.webRuntime?.clientGatewayPublicUrl ?? "Waiting client"} | expires {formatTime(pendingPairing.expiresAt)}</small>
      </div>
      <div className="modal-actions">
        <button className="button" onClick={() => void dismiss()} type="button">Reject</button>
        <button className="button button-primary" onClick={() => void approve()} type="button">Confirm Pairing</button>
      </div>
    </GlobalModal>
  );
}

function GlobalModal(props: { title: string; children: ReactNode; onClose(): void }) {
  function submitOnEnter(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
    const submitButton = event.currentTarget.querySelector<HTMLButtonElement>(".modal-actions .button-primary:not(:disabled), [data-modal-submit]:not(:disabled)");
    if (!submitButton) return;
    event.preventDefault();
    submitButton.click();
  }

  return (
    <div className="global-client-pairing-backdrop">
      <section className="global-client-pairing-panel" role="dialog" aria-modal="true" onKeyDown={submitOnEnter}>
        <div className="panel-heading">
          <h2 className="panel-title">{props.title}</h2>
          <button className="button" onClick={props.onClose} type="button">Close</button>
        </div>
        {props.children}
      </section>
    </div>
  );
}

function formatTime(value?: number): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}
