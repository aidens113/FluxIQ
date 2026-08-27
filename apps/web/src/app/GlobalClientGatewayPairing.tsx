"use client";

import { QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, InlineNotice, Modal } from "../features/programs/shared-ui";

export type ClientPairingRequest = {
  pairingCode: string;
  referenceCode?: string;
  requestedBySessionId?: string;
  requestedByClientId?: string;
  requestedByClientName?: string;
  expiresAt: number;
  consumedAt?: number;
};

type ClientGatewaySnapshot = {
  sessions?: Array<{ sessionId: string; clientId?: string; name?: string }>;
  pairings?: ClientPairingRequest[];
  webRuntime?: {
    clientGatewayPublicUrl?: string | null;
    clientGatewayListening?: boolean;
    clientGatewayError?: string | null;
  };
};

export function pendingPairingRequests(pairings: ClientPairingRequest[], nowMs: number, dismissedCodes: string[]): ClientPairingRequest[] {
  const dismissed = new Set(dismissedCodes);
  return pairings.filter((pairing) => pairing.requestedBySessionId && !pairing.consumedAt && pairing.expiresAt > nowMs && !dismissed.has(pairing.pairingCode));
}

export function pairingExpiryLabel(expiresAt: number, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - nowMs) / 1_000));
  return seconds ? `Expires in ${seconds}s` : "Expired";
}

export function GlobalClientGatewayPairing() {
  const [snapshot, setSnapshot] = useState<ClientGatewaySnapshot>({});
  const [dismissedCodes, setDismissedCodes] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let delayMs = 1_000;

    async function refresh() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(() => void refresh(), 5_000);
        return;
      }
      const response = await fetch("/api/client-gateway/snapshot", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (response?.status === 401) return;
      const result = response ? await response.json().catch(() => undefined) as { ok?: boolean; payload?: ClientGatewaySnapshot } | undefined : undefined;
      if (result?.ok) {
        const next = result.payload ?? {};
        setSnapshot(next);
        const hasPending = pendingPairingRequests(next.pairings ?? [], Date.now(), []).length > 0;
        delayMs = hasPending ? 1_000 : Math.min(10_000, Math.round(delayMs * 1.6));
      } else {
        delayMs = Math.min(10_000, Math.round(delayMs * 1.8));
      }
      timer = window.setTimeout(() => void refresh(), delayMs);
    }

    function resumeWhenVisible() {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      delayMs = 1_000;
      void refresh();
    }

    void refresh();
    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resumeWhenVisible);
    };
  }, []);

  const pending = useMemo(() => pendingPairingRequests(snapshot.pairings ?? [], nowMs, dismissedCodes), [dismissedCodes, nowMs, snapshot.pairings]);
  useEffect(() => {
    if (!pending.length) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pending.length]);

  const pendingPairing = pending[0];
  const pendingSession = (snapshot.sessions ?? []).find((session) => session.sessionId === pendingPairing?.requestedBySessionId);
  if (!pendingPairing) return null;

  function removePairing(pairingCode: string) {
    setDismissedCodes((codes) => [...codes.filter((code) => code !== pairingCode), pairingCode].slice(-20));
    setSnapshot((current) => ({ ...current, pairings: (current.pairings ?? []).filter((pairing) => pairing.pairingCode !== pairingCode) }));
  }

  async function resolvePairing(action: "approve" | "reject") {
    const pairingCode = pendingPairing?.pairingCode;
    if (!pairingCode || busyAction) return;
    setBusyAction(action);
    setActionError("");
    const endpoint = action === "approve" ? "approve-pairing" : "dismiss-pairing";
    try {
      const response = await fetch(`/api/client-gateway/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingCode })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => undefined) as { error?: string } | undefined;
        setActionError(result?.error ?? `The pairing request could not be ${action === "approve" ? "approved" : "rejected"}.`);
        return;
      }
      removePairing(pairingCode);
    } catch {
      setActionError("The client gateway could not be reached. The request remains pending.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Modal busy={Boolean(busyAction)} closeOnEscape={!busyAction} description="Confirm that the reference code matches the client requesting access." title="Client pairing request" onClose={() => void resolvePairing("reject")}>
      {pending.length > 1 ? <InlineNotice message={`Showing request 1 of ${pending.length}. The next request will open after this one is resolved.`} tone="info" /> : null}
      {actionError ? <InlineNotice message={actionError} title="Pairing unchanged" tone="error" /> : null}
      {snapshot.webRuntime?.clientGatewayError ? <InlineNotice message={snapshot.webRuntime.clientGatewayError} title="Gateway issue" tone="warning" /> : null}
      <div className="automation-client-pairing-modal">
        <QrCode aria-hidden size={20} />
        <strong>{pendingPairing.requestedByClientName ?? pendingSession?.name ?? "Extension client"}</strong>
        <span>Approve only when this reference matches the requesting client.</span>
        <code>{pendingPairing.referenceCode ?? pendingPairing.pairingCode}</code>
        <small>{pendingSession?.clientId ?? pendingPairing.requestedByClientId ?? snapshot.webRuntime?.clientGatewayPublicUrl ?? "Waiting client"} | {pairingExpiryLabel(pendingPairing.expiresAt, nowMs)}</small>
      </div>
      <div className="modal-actions">
        <Button busy={busyAction === "reject"} disabled={busyAction === "approve"} onClick={() => void resolvePairing("reject")}>Reject</Button>
        <Button busy={busyAction === "approve"} data-modal-submit disabled={busyAction === "reject"} onClick={() => void resolvePairing("approve")} variant="primary">Confirm pairing</Button>
      </div>
    </Modal>
  );
}