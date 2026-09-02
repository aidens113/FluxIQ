"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createActivePoller } from "./active-poller";
import { useClientGatewayPort } from "./client-api";
import {
  buildClientCommand,
  clientSelectionLocation,
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
  const [pinnedSession, setPinnedSession] = useState<any | null>(null);
  const [selectedSessionExists, setSelectedSessionExists] = useState<boolean | null>(null);
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
  const itemRequestRef = useRef({ sessions: 0, pairings: 0, trustedClients: 0 });
  const selectedSessionRequestRef = useRef(0);
  const [pages, setPages] = useState<Record<"sessions" | "pairings" | "trustedClients", { index: number; cursors: Array<string | null>; total: number; nextCursor: string | null; hasMore: boolean; search: string }>>({
    sessions: { index: 0, cursors: [null], total: 0, nextCursor: null, hasMore: false, search: "" },
    pairings: { index: 0, cursors: [null], total: 0, nextCursor: null, hasMore: false, search: "" },
    trustedClients: { index: 0, cursors: [null], total: 0, nextCursor: null, hasMore: false, search: "" }
  });
  const [searchDrafts, setSearchDrafts] = useState({ sessions: "", pairings: "", trustedClients: "" });
  const [itemErrors, setItemErrors] = useState({ sessions: "", pairings: "", trustedClients: "" });
  const pagesRef = useRef(pages);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  const refreshGateway = useCallback(async () => {
    if (!props.active) return;
    const requestId = ++refreshRequestRef.current;
    setLoading(true);
    const currentPages = pagesRef.current;
    const [result, sessions, pairings, trustedClients] = await Promise.all([
      port.querySnapshot(),
      port.listItems({ kind: "sessions", limit: 50, cursor: currentPages.sessions.cursors[currentPages.sessions.index] ?? null, search: currentPages.sessions.search }),
      port.listItems({ kind: "pairings", limit: 50, cursor: currentPages.pairings.cursors[currentPages.pairings.index] ?? null, search: currentPages.pairings.search }),
      port.listItems({ kind: "trustedClients", limit: 50, cursor: currentPages.trustedClients.cursors[currentPages.trustedClients.index] ?? null, search: currentPages.trustedClients.search })
    ]);
    if (refreshRequestRef.current !== requestId || !props.active) return;
    setLoading(false);
    if (!result.ok) {
      setStatus(result.error ?? "Client gateway could not be loaded.");
      return;
    }
    const next = {
      ...(result.payload ?? emptyClientGatewaySnapshot),
      sessions: sessions.payload?.items ?? [],
      pairings: pairings.payload?.items ?? [],
      trustedClients: trustedClients.payload?.items ?? []
    };
    setSnapshot(next);
    setPages((current) => ({
      sessions: { ...current.sessions, total: sessions.payload?.page?.total ?? 0, nextCursor: sessions.payload?.page?.nextCursor ?? null, hasMore: sessions.payload?.page?.hasMore === true },
      pairings: { ...current.pairings, total: pairings.payload?.page?.total ?? 0, nextCursor: pairings.payload?.page?.nextCursor ?? null, hasMore: pairings.payload?.page?.hasMore === true },
      trustedClients: { ...current.trustedClients, total: trustedClients.payload?.page?.total ?? 0, nextCursor: trustedClients.payload?.page?.nextCursor ?? null, hasMore: trustedClients.payload?.page?.hasMore === true }
    }));
    setItemErrors({ sessions: sessions.ok ? "" : sessions.error ?? "Connected clients could not be loaded.", pairings: pairings.ok ? "" : pairings.error ?? "Pairing requests could not be loaded.", trustedClients: trustedClients.ok ? "" : trustedClients.error ?? "Trusted clients could not be loaded." });
    setSelectedSessionId((current) => current || retainSelectedSession(next.sessions, current));
  }, [port, props.active]);

  const navigateItems = async (kind: "sessions" | "pairings" | "trustedClients", direction: "previous" | "next") => {
    const current = pagesRef.current[kind];
    const index = direction === "next" ? current.index + 1 : Math.max(0, current.index - 1);
    const nextCursor = direction === "next" ? current.nextCursor : current.cursors[index] ?? null;
    if (direction === "next" && !nextCursor) return;
    const requestId = ++itemRequestRef.current[kind];
    const result = await port.listItems({ kind, limit: 50, cursor: nextCursor, search: current.search });
    if (requestId !== itemRequestRef.current[kind]) return;
    if (!result.ok) { setItemErrors((errors) => ({ ...errors, [kind]: result.error ?? "This page could not be loaded." })); return; }
    setItemErrors((errors) => ({ ...errors, [kind]: "" }));
    const items = result.payload?.items ?? [];
    setSnapshot((currentSnapshot) => ({ ...currentSnapshot, [kind]: items }));
    setPages((currentPages) => {
      const cursors = direction === "next" ? [...currentPages[kind].cursors.slice(0, index), nextCursor] : currentPages[kind].cursors;
      return { ...currentPages, [kind]: { index, cursors, total: result.payload?.page?.total ?? currentPages[kind].total, nextCursor: result.payload?.page?.nextCursor ?? null, hasMore: result.payload?.page?.hasMore === true } };
    });
  };

  const submitSearch = async (kind: "sessions" | "pairings" | "trustedClients") => {
    const search = searchDrafts[kind].trim();
    const requestId = ++itemRequestRef.current[kind];
    const result = await port.listItems({ kind, limit: 50, cursor: null, search });
    if (requestId !== itemRequestRef.current[kind]) return;
    if (!result.ok) { setItemErrors((errors) => ({ ...errors, [kind]: result.error ?? "Search could not be completed." })); return; }
    setSnapshot((current) => ({ ...current, [kind]: result.payload?.items ?? [] }));
    setPages((current) => ({ ...current, [kind]: { index: 0, cursors: [null], total: result.payload?.page?.total ?? 0, nextCursor: result.payload?.page?.nextCursor ?? null, hasMore: result.payload?.page?.hasMore === true, search } }));
    setItemErrors((errors) => ({ ...errors, [kind]: "" }));
  };

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
  useEffect(() => { const visible = sessions.find((session) => session.sessionId === selectedSessionId); if (visible) { setPinnedSession(visible); setSelectedSessionExists(true); } }, [selectedSessionId, sessions]);
  useEffect(() => {
    if (!props.active || !selectedSessionId || sessions.some((session) => session.sessionId === selectedSessionId) || pinnedSession?.sessionId !== selectedSessionId) return;
    const requestId = ++selectedSessionRequestRef.current;
    setSelectedSessionExists(null);
    void port.listItems({ kind: "sessions", limit: 50, cursor: null, search: selectedSessionId }).then((result) => {
      if (requestId !== selectedSessionRequestRef.current) return;
      const found = Boolean(result.ok && result.payload?.items?.some((session) => session.sessionId === selectedSessionId));
      setSelectedSessionExists(found);
      if (!found) setPinnedSession(null);
    });
    return () => { selectedSessionRequestRef.current += 1; };
  }, [pinnedSession?.sessionId, port, props.active, selectedSessionId, sessions]);
  const selectedSession = selectedSessionId
    ? sessions.find((session) => session.sessionId === selectedSessionId) ?? (pinnedSession?.sessionId === selectedSessionId ? pinnedSession : null)
    : sessions[0];
  const selectedSessionLocation = clientSelectionLocation({ selectedSessionId, visibleSessions: sessions, pinnedSessionId: pinnedSession?.sessionId, verifiedExists: selectedSessionExists });
  const selectSession = (sessionId: string) => { setSelectedSessionId(sessionId); setSelectedSessionExists(true); const visible = sessions.find((session) => session.sessionId === sessionId); if (visible) setPinnedSession(visible); };
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
    selectedSessionLocation,
    setSelectedSessionId: selectSession,
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
    ,pages
    ,navigateItems
    ,searchDrafts
    ,setSearchDrafts
    ,submitSearch
    ,itemErrors
  };
}
