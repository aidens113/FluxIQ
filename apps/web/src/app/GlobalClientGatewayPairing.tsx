"use client";

import { QrCode } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

export function pairingSnapshot(payload: ClientGatewaySnapshot | undefined): ClientGatewaySnapshot {
  if (!payload) return {};
  return {
    ...(payload.sessions ? { sessions: payload.sessions.map((session) => ({ ...session })) } : {}),
    ...(payload.pairings ? { pairings: payload.pairings.map((pairing) => ({ ...pairing })) } : {}),
    ...(payload.webRuntime ? { webRuntime: { ...payload.webRuntime } } : {})
  };
}

export function pairingSnapshotsEqual(left: ClientGatewaySnapshot, right: ClientGatewaySnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function pendingPairingRequests(pairings: ClientPairingRequest[], nowMs: number, dismissedCodes: string[]): ClientPairingRequest[] {
  const dismissed = new Set(dismissedCodes);
  return pairings.filter((pairing) => pairing.requestedBySessionId && !pairing.consumedAt && pairing.expiresAt > nowMs && !dismissed.has(pairing.pairingCode));
}

export function pairingExpiryLabel(expiresAt: number, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - nowMs) / 1_000));
  return seconds ? `Expires in ${seconds}s` : "Expired";
}

/**
 * The notice for an approval the gateway closed for good: the client is no
 * longer waiting (its browser disconnected, or it is already paired) or the
 * request is gone. Any other failure leaves the request pending to try again.
 */
export function closedPairingNotice(status: number, result: { error?: string; code?: string } | undefined): string | null {
  if (status === 409 && result?.code?.startsWith("pairing.")) return result.error ?? "This pairing can no longer be approved.";
  if (status === 404) return result?.error ?? "This pairing request is no longer available.";
  return null;
}

export type PairingNotice = {
  title: string;
  message: string;
  tone: "error" | "info";
};

/**
 * Why a request the operator was shown left the list without their approve or
 * dismiss. The snapshot keeps an approved request (with consumedAt) and its
 * expiry; a request the gateway withdrew when the browser disconnected is gone
 * before it expires, as is one dismissed or replaced elsewhere.
 */
export function vanishedPairingNotice(shown: ClientPairingRequest, pairings: ClientPairingRequest[], nowMs: number): PairingNotice {
  const current = pairings.find((pairing) => pairing.pairingCode === shown.pairingCode);
  if (current?.consumedAt) {
    return {
      title: "Paired elsewhere",
      message: "This request was approved from another window, so the browser is already paired.",
      tone: "info"
    };
  }
  if ((current?.expiresAt ?? shown.expiresAt) <= nowMs) {
    return {
      title: "Nothing was paired",
      message: "The pairing request expired before you confirmed, so nothing was paired. Connect again from the browser to get a new code.",
      tone: "error"
    };
  }
  return {
    title: "Nothing was paired",
    message: "The request closed before you confirmed, usually because the browser disconnected, so nothing was paired. Connect again from the browser to get a new code.",
    tone: "error"
  };
}

function closedApprovalNotice(message: string): PairingNotice {
  return { title: "Nothing was paired", message, tone: "error" };
}

export function GlobalClientGatewayPairing() {
  const [snapshot, setSnapshot] = useState<ClientGatewaySnapshot>({});
  const [dismissedCodes, setDismissedCodes] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState("");
  // Outlives the request it is about: the request leaves the list at the next
  // poll, and the person must still learn that nothing was paired.
  const [closedNotice, setClosedNotice] = useState<PairingNotice | null>(null);
  const shownPairing = useRef<ClientPairingRequest | null>(null);

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
        const next = pairingSnapshot(result.payload);
        setSnapshot((current) => pairingSnapshotsEqual(current, next) ? current : next);
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
  // A request leaving the modal without this operator's approve or dismiss
  // (those mark it dismissed first) was withdrawn, expired or resolved
  // elsewhere; say which instead of letting it vanish.
  useEffect(() => {
    const shown = shownPairing.current;
    shownPairing.current = pendingPairing ?? null;
    if (!shown || shown.pairingCode === pendingPairing?.pairingCode) return;
    if (dismissedCodes.includes(shown.pairingCode)) return;
    setClosedNotice(vanishedPairingNotice(shown, snapshot.pairings ?? [], Date.now()));
  }, [dismissedCodes, pendingPairing, snapshot.pairings]);

  const pendingSession = (snapshot.sessions ?? []).find((session) => session.sessionId === pendingPairing?.requestedBySessionId);
  if (!pendingPairing) return closedNotice ? (
    <Modal description="The pairing request closed before you confirmed it." title="Pairing request closed" onClose={() => setClosedNotice(null)}>
      <InlineNotice message={closedNotice.message} title={closedNotice.title} tone={closedNotice.tone} />
      <div className="modal-actions">
        <Button data-modal-submit onClick={() => setClosedNotice(null)} variant="primary">Close</Button>
      </div>
    </Modal>
  ) : null;

  function removePairing(pairingCode: string) {
    setDismissedCodes((codes) => [...codes.filter((code) => code !== pairingCode), pairingCode].slice(-20));
    setSnapshot((current) => ({ ...current, pairings: (current.pairings ?? []).filter((pairing) => pairing.pairingCode !== pairingCode) }));
  }

  async function resolvePairing(action: "approve" | "reject") {
    const pairingCode = pendingPairing?.pairingCode;
    if (!pairingCode || busyAction) return;
    setBusyAction(action);
    setActionError("");
    setClosedNotice(null);
    const endpoint = action === "approve" ? "approve-pairing" : "dismiss-pairing";
    try {
      const response = await fetch(`/api/client-gateway/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingCode })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => undefined) as { error?: string; code?: string } | undefined;
        const closed = action === "approve" ? closedPairingNotice(response.status, result) : null;
        if (closed) {
          setClosedNotice(closedApprovalNotice(closed));
          removePairing(pairingCode);
          return;
        }
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

  function dismissPairingPrompt() {
    const pairingCode = pendingPairing?.pairingCode;
    if (!pairingCode || busyAction) return;
    removePairing(pairingCode);
  }

  return (
    <Modal busy={Boolean(busyAction)} closeOnEscape={!busyAction} description="Confirm that the reference code matches the client requesting access." title="Client pairing request" onClose={dismissPairingPrompt}>
      {pending.length > 1 ? <InlineNotice message={`Showing request 1 of ${pending.length}. The next request will open after this one is resolved.`} tone="info" /> : null}
      {closedNotice ? <InlineNotice message={closedNotice.message} title={`Previous request: ${closedNotice.title.toLowerCase()}`} tone={closedNotice.tone === "error" ? "warning" : "info"} /> : null}
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
