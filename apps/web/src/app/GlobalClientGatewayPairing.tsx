"use client";

import { QrCode } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGatewayChanges, type GatewayChangeStatus } from "../features/client-gateway-changes";
import { requestProgramAuthentication } from "../features/programs/program-auth-recovery";
import { Button, InlineNotice, Modal } from "../features/programs/shared-ui";
import "./client-pairing-bars.css";
import "./client-pairing-modal.css";

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

/**
 * The requests still waiting for a person: asked for by a client, not yet
 * approved, and not answered from this tab (`resolvedCodes`). The gateway is
 * the clock: a code that lapses while its client still waits is renewed there
 * under a new code, and one it drops leaves the snapshot, so nothing is dropped
 * on this tab's own clock (which would close a request the gateway is renewing).
 */
export function pendingPairingRequests(pairings: ClientPairingRequest[], resolvedCodes: string[]): ClientPairingRequest[] {
  const resolved = new Set(resolvedCodes);
  return pairings.filter((pairing) => pairing.requestedBySessionId && !pairing.consumedAt && !resolved.has(pairing.pairingCode));
}

/** Which request a pairing belongs to: the client session that asked. A renewed code is the same request under a new code. */
export function pairingRequestKey(pairing: Pick<ClientPairingRequest, "pairingCode" | "requestedBySessionId">): string {
  return pairing.requestedBySessionId ?? pairing.pairingCode;
}

/**
 * Whether a request that left the dialog is still waiting under some code:
 * the gateway renewed its code, or the person set it aside for the Review bar.
 * Either way it is the same request, not a closed one.
 */
export function pairingStillWaiting(shown: ClientPairingRequest, pending: ClientPairingRequest[]): boolean {
  const key = pairingRequestKey(shown);
  return pending.some((pairing) => pairingRequestKey(pairing) === key);
}

/**
 * Who is asking, as the person knows it: the name the browser gave the gateway
 * ("Chrome on Windows"), or "A browser" when it gave none.
 */
export function pairingClientName(pairing: Pick<ClientPairingRequest, "requestedByClientName">, sessionName?: string): string {
  return pairing.requestedByClientName?.trim() || sessionName?.trim() || "A browser";
}

/** The dialog's title: "Chrome on Windows wants to connect". */
export function pairingTitle(pairing: Pick<ClientPairingRequest, "requestedByClientName">, sessionName?: string): string {
  return `${pairingClientName(pairing, sessionName)} wants to connect`;
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

/**
 * What to tell the person while the panel is not hearing gateway changes, or
 * null while it is. The request on screen may have been approved, dismissed
 * or withdrawn elsewhere meanwhile; the panel reads it again as soon as the
 * stream is back, and never on a timer.
 */
export function liveUpdatesNotice(status: GatewayChangeStatus): string | null {
  if (status === "live" || status === "connecting") return null;
  if (status === "reconnecting") return "Live updates dropped and are reconnecting. This request may have changed meanwhile; it is read again as soon as they are back.";
  return "Live updates are off. This request may have changed; it is read again when you reconnect, this tab is shown again or the network returns.";
}

export function GlobalClientGatewayPairing() {
  // The page's shared gateway subscription: it reads the snapshot when the stream opens and on each change it signals.
  const changes = useGatewayChanges();
  const [snapshot, setSnapshot] = useState<ClientGatewaySnapshot>({});
  // Requests answered from this tab (approved or declined), by code.
  const [resolvedCodes, setResolvedCodes] = useState<string[]>([]);
  // Requests the person closed the dialog on, by the client that asked: they wait in the Review bar, under whatever code the gateway renews them to.
  const [deferredKeys, setDeferredKeys] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState("");
  // Outlives the request it is about: the request leaves the list at the next
  // read, and the person must still learn that nothing was paired.
  const [closedNotice, setClosedNotice] = useState<PairingNotice | null>(null);
  const shownPairing = useRef<ClientPairingRequest | null>(null);

  // A refusal clears the shared snapshot, so a signed-out page shows no request.
  useEffect(() => {
    const next = pairingSnapshot(changes.snapshot as ClientGatewaySnapshot | undefined);
    setSnapshot((current) => pairingSnapshotsEqual(current, next) ? current : next);
  }, [changes.snapshot]);

  const pending = useMemo(() => pendingPairingRequests(snapshot.pairings ?? [], resolvedCodes), [resolvedCodes, snapshot.pairings]);
  const prompted = useMemo(() => pending.filter((pairing) => !deferredKeys.includes(pairingRequestKey(pairing))), [deferredKeys, pending]);
  const deferred = useMemo(() => pending.filter((pairing) => deferredKeys.includes(pairingRequestKey(pairing))), [deferredKeys, pending]);
  useEffect(() => {
    if (!prompted.length) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [prompted.length]);

  const pendingPairing = prompted[0];
  // A request leaving the modal without this operator's approve or decline
  // (those mark it resolved first) was withdrawn, expired or resolved
  // elsewhere; say which instead of letting it vanish. One still waiting under
  // a renewed code, or set aside for the Review bar, has not closed.
  useEffect(() => {
    const shown = shownPairing.current;
    shownPairing.current = pendingPairing ?? null;
    if (!shown || shown.pairingCode === pendingPairing?.pairingCode) return;
    if (resolvedCodes.includes(shown.pairingCode)) return;
    if (pairingStillWaiting(shown, pending)) return;
    setClosedNotice(vanishedPairingNotice(shown, snapshot.pairings ?? [], Date.now()));
  }, [pending, pendingPairing, resolvedCodes, snapshot.pairings]);

  const sessionName = (pairing: ClientPairingRequest | undefined) => (snapshot.sessions ?? []).find((session) => session.sessionId === pairing?.requestedBySessionId)?.name;
  const pendingSession = (snapshot.sessions ?? []).find((session) => session.sessionId === pendingPairing?.requestedBySessionId);
  // A signed-out page reconnects by signing in again in place; anything else re-opens the stream and reads now.
  const reconnect = () => (changes.refused ? void requestProgramAuthentication() : changes.refresh());
  const reconnectLabel = changes.refused ? "Sign in again" : "Reconnect";
  // Not modal: what waits for the person, and whether this tab hears changes at all, stay on screen while they work.
  const notLiveBar = changes.status === "closed" && !pendingPairing;
  const bars = notLiveBar || deferred.length ? (
    <div aria-label="Connect requests" className="client-pairing-bars">
      {notLiveBar ? (
        <InlineNotice
          action={<Button onClick={reconnect}>{reconnectLabel}</Button>}
          message={changes.refused ? "Your session ended, so new connect requests do not appear here. Sign in again to see them." : "New connect requests do not appear here until live updates are back."}
          title="Not live"
          tone="warning"
        />
      ) : null}
      {deferred.map((pairing) => (
        <InlineNotice
          action={<Button onClick={() => reviewPairing(pairing)}>Review</Button>}
          key={pairingRequestKey(pairing)}
          message="Waiting for your approval."
          title={pairingTitle(pairing, sessionName(pairing))}
          tone="info"
        />
      ))}
    </div>
  ) : null;
  if (!pendingPairing) return (
    <>
      {bars}
      {closedNotice ? (
        <Modal description="The pairing request closed before you confirmed it." title="Pairing request closed" onClose={() => setClosedNotice(null)}>
          <InlineNotice message={closedNotice.message} title={closedNotice.title} tone={closedNotice.tone} />
          <div className="modal-actions">
            <Button data-modal-submit onClick={() => setClosedNotice(null)} variant="primary">Close</Button>
          </div>
        </Modal>
      ) : null}
    </>
  );

  function removePairing(pairingCode: string) {
    setResolvedCodes((codes) => [...codes.filter((code) => code !== pairingCode), pairingCode].slice(-20));
    setSnapshot((current) => ({ ...current, pairings: (current.pairings ?? []).filter((pairing) => pairing.pairingCode !== pairingCode) }));
  }

  function reviewPairing(pairing: ClientPairingRequest) {
    const key = pairingRequestKey(pairing);
    setDeferredKeys((keys) => keys.filter((item) => item !== key));
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

  // Closing the dialog answers nothing: the request stays pending, in the Review bar, until it is approved, declined or ends.
  function dismissPairingPrompt() {
    if (!pendingPairing || busyAction) return;
    const key = pairingRequestKey(pendingPairing);
    setDeferredKeys((keys) => [...keys.filter((item) => item !== key), key].slice(-20));
  }

  return (
    <>
      {bars}
      <Modal busy={Boolean(busyAction)} closeOnEscape={!busyAction} description="Check that the code below matches the one shown in the app you are connecting." title={pairingTitle(pendingPairing, pendingSession?.name)} onClose={dismissPairingPrompt}>
      {liveUpdatesNotice(changes.status) ? <InlineNotice action={changes.status === "closed" ? <Button onClick={reconnect}>{reconnectLabel}</Button> : undefined} message={liveUpdatesNotice(changes.status) ?? ""} title="Not live" tone="warning" /> : null}
      {prompted.length > 1 ? <InlineNotice message={`Showing request 1 of ${prompted.length}. The next request will open after this one is resolved.`} tone="info" /> : null}
      {closedNotice ? <InlineNotice message={closedNotice.message} title={`Previous request: ${closedNotice.title.toLowerCase()}`} tone={closedNotice.tone === "error" ? "warning" : "info"} /> : null}
      {actionError ? <InlineNotice message={actionError} title="Pairing unchanged" tone="error" /> : null}
      {snapshot.webRuntime?.clientGatewayError ? <InlineNotice message={snapshot.webRuntime.clientGatewayError} title="Gateway issue" tone="warning" /> : null}
      <div className="client-pairing-request">
        <div className="client-pairing-request-head"><QrCode aria-hidden size={20} /><span>Check this code against the one in {pairingClientName(pendingPairing, pendingSession?.name)}</span></div>
        <dl className="client-pairing-request-lines">
          <dt>Code</dt>
          <dd><code className="client-pairing-request-code">{pendingPairing.referenceCode ?? pendingPairing.pairingCode}</code></dd>
          <dt>Time left</dt>
          <dd>{pairingExpiryLabel(pendingPairing.expiresAt, nowMs)}</dd>
        </dl>
        <p className="client-pairing-request-effect">Approve only when this code matches the one shown there. Approving lets it use this FluxIQ; declining leaves it unconnected.</p>
      </div>
      <div className="modal-actions">
        <Button busy={busyAction === "reject"} disabled={busyAction === "approve"} onClick={() => void resolvePairing("reject")}>Decline</Button>
        <Button busy={busyAction === "approve"} data-autofocus data-modal-submit disabled={busyAction === "reject"} onClick={() => void resolvePairing("approve")} variant="primary">Confirm</Button>
      </div>
      </Modal>
    </>
  );
}
