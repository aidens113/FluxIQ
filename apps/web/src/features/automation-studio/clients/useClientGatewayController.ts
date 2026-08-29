"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createActivePoller } from "./active-poller";
import { useClientGatewayPort } from "./client-api";
import {
  buildClientCommand,
  emptyClientGatewaySnapshot,
  retainSelectedSession,
  uniqueClientActionTypes,
  type ClientActionKind,
  type ClientGatewaySnapshot
} from "./client-model";

export function useClientGatewayController(props: { active: boolean; projectId: string | null }) {
  const port = useClientGatewayPort();
  const [snapshot, setSnapshot] = useState<ClientGatewaySnapshot>(emptyClientGatewaySnapshot);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ kind: ClientActionKind; trustedClientId?: string } | null>(null);
  const [credentials, setCredentials] = useState({ password: "", pin: "", totp: "" });
  const [authorizationError, setAuthorizationError] = useState("");
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [pairingBusyCode, setPairingBusyCode] = useState("");
  const [actionType, setActionType] = useState("");
  const [selector, setSelector] = useState("");
  const [text, setText] = useState("");
  const refreshRequestRef = useRef(0);

  const refreshGateway = useCallback(async () => {
    if (!props.active) return;
    const requestId = ++refreshRequestRef.current;
    setLoading(true);
    const result = await port.querySnapshot();
    if (refreshRequestRef.current !== requestId || !props.active) return;
    setLoading(false);
    if (!result.ok) {
      setStatus(result.error ?? "Client gateway could not be loaded.");
      return;
    }
    const next = result.payload ?? emptyClientGatewaySnapshot;
    setSnapshot(next);
    setSelectedSessionId((current) => retainSelectedSession(next.sessions, current));
  }, [port, props.active]);

  useEffect(() => {
    const poller = createActivePoller({
      active: () => props.active,
      run: refreshGateway,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (timer) => window.clearTimeout(timer),
      delayMs: 5_000
    });
    if (props.active) poller.sync();
    else {
      refreshRequestRef.current += 1;
      setLoading(false);
    }
    return () => {
      poller.dispose();
      refreshRequestRef.current += 1;
    };
  }, [props.active, refreshGateway]);

  const sessions = snapshot.sessions;
  const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId) ?? sessions[0];
  const actionTypes = useMemo(() => uniqueClientActionTypes(selectedSession), [selectedSession]);
  useEffect(() => {
    if (actionType && !actionTypes.includes(actionType) || !actionType && actionTypes.length) setActionType(actionTypes[0] ?? "");
  }, [actionType, actionTypes]);

  const requestAuthorization = (kind: ClientActionKind, trustedClientId?: string) => {
    setPendingAction({ kind, ...(trustedClientId ? { trustedClientId } : {}) });
    setCredentials({ password: "", pin: "", totp: "" });
    setAuthorizationError("");
  };

  const authorizeAction = async () => {
    if (!pendingAction || !selectedSession && pendingAction.kind !== "revoke") return;
    setAuthorizationBusy(true);
    setAuthorizationError("");
    try {
      if (pendingAction.kind === "start" && selectedSession) {
        setStatus("Starting client recording...");
        const result = await port.startRecording({ sessionId: selectedSession.sessionId, projectId: props.projectId, authorizationPin: credentials.pin });
        setStatus(result.ok ? "Recording " + (result.payload?.recording?.recordingId ?? "started") + "." : result.error ?? "Recording could not start.");
      }
      if (pendingAction.kind === "stop" && selectedSession) {
        setStatus("Stopping client recording...");
        const result = await port.stopRecording({ sessionId: selectedSession.sessionId, authorizationPin: credentials.pin });
        setStatus(result.ok ? "Recording " + (result.payload?.recording?.recordingId ?? "stopped") + " stopped and is available as Flow evidence." : result.error ?? "Recording could not stop.");
      }
      if (pendingAction.kind === "execute" && selectedSession && actionType) {
        setStatus("Sending action...");
        const result = await port.executeAction({ sessionId: selectedSession.sessionId, authorizationPin: credentials.pin, command: buildClientCommand(actionType, selector, text) });
        setStatus(result.ok ? "Action " + (result.payload?.result?.status ?? "completed") + "." : result.error ?? "Action failed.");
      }
      if (pendingAction.kind === "revoke" && pendingAction.trustedClientId) {
        const result = await port.revokeTrust({ trustedClientId: pendingAction.trustedClientId, authorizationPin: credentials.pin });
        setStatus(result.ok ? "Client trust revoked." : result.error ?? "Client trust could not be revoked.");
      }
      setPendingAction(null);
      if (props.active) await refreshGateway();
    } catch {
      setAuthorizationError("The client command could not be completed.");
    } finally {
      setAuthorizationBusy(false);
    }
  };

  const captureSnapshot = async () => {
    if (!selectedSession) return;
    const result = await port.captureSnapshot(selectedSession.sessionId);
    setStatus(result.ok ? "Snapshot request queued." : result.error ?? "Snapshot request failed.");
    if (result.ok && props.active) await refreshGateway();
  };

  const resolvePairing = async (pairingCode: string, action: "approve" | "reject") => {
    if (pairingBusyCode) return;
    setPairingBusyCode(pairingCode);
    setStatus(action === "approve" ? "Approving client pairing..." : "Rejecting client pairing...");
    try {
      const result = await port.resolvePairing(pairingCode, action);
      setStatus(result.ok ? action === "approve" ? "Client paired." : "Pairing request rejected." : result.error ?? "Pairing request could not be resolved.");
      if (result.ok && props.active) await refreshGateway();
    } catch {
      setStatus("The client gateway could not be reached. The pairing request remains pending.");
    } finally {
      setPairingBusyCode("");
    }
  };

  return {
    snapshot,
    sessions,
    selectedSession,
    selectedSessionId,
    setSelectedSessionId,
    actionTypes,
    actionType,
    setActionType,
    selector,
    setSelector,
    text,
    setText,
    status,
    loading,
    pendingAction,
    setPendingAction,
    credentials,
    setCredentials,
    authorizationError,
    authorizationBusy,
    pairingBusyCode,
    requestAuthorization,
    authorizeAction,
    captureSnapshot,
    resolvePairing,
    refreshGateway
  };
}