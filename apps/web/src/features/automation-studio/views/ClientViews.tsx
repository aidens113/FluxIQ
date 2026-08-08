"use client";

import { QrCode, Radio, RefreshCcw, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useProgramApi } from "../../programs/program-api";
import { Field, KeyValue, StatusBadge, StatusText, VisualAlert } from "../../programs/shared-ui";
import { InspectorSection } from "./InspectorView";
import { digits, formatTime, uniqueStrings } from "./view-utils";
export function AutomationAssistantView(props: { node: any; recording: any; signals: any[] }) {
  const [assistantText, setAssistantText] = useState("");
  const [proposal, setProposal] = useState("No proposal selected.");
  const propose = (kind: string) => {
    setProposal(`${kind}: Context includes ${props.node?.label ?? "no node"}, ${props.recording?.recordingId ?? "no recording"}, and ${props.signals.length} signals.`);
  };
  return (
    <section className="automation-assistant-view">
      <div className="context-chip-row">
        <span>Node: {props.node?.label ?? "none"}</span>
        <span>Recording: {props.recording?.recordingId ?? "none"}</span>
        <span>Signals: {props.signals.length}</span>
      </div>
      <textarea aria-label="Assistant request" onChange={(event) => setAssistantText(event.target.value)} placeholder="Ask for an explanation or propose a structured policy edit." value={assistantText} />
      <div className="assistant-proposal-card">
        <strong>Proposal Preview</strong>
        <span>{proposal}</span>
        <div className="inline-actions"><button className="button" onClick={() => propose("Explain selection")} type="button">Explain Selection</button><button className="button" onClick={() => propose("Compare evidence")} type="button">Compare Evidence</button><button className="button" disabled={!assistantText.trim()} onClick={() => propose("Propose policy edit")} type="button">Propose Edit</button></div>
      </div>
    </section>
  );
}

export function AutomationConfigView(props: { policy: any }) {
  return (
    <section className="automation-config-view">
      <InspectorSection title="Flow Inputs" rows={[["target_item", "item reference"], ["retry_count", "integer, default 3"], ["runtime_editable", "true"]]} />
      <InspectorSection title="Flow Outputs" rows={[["completion_status", "runtime statistic"], ["elapsed_time", "runtime statistic"], ["failure_reason", "error path"]]} />
      <InspectorSection title="Configuration" rows={[["Policy", props.policy?.policyId ?? "-"], ["Environment overrides", "None"], ["Runtime limits", "Default"]]} />
    </section>
  );
}

export function AutomationClientGatewayView(props: { projectId: string | null }) {
  const api = useProgramApi("automation-studio");
  const [snapshot, setSnapshot] = useState<any>({ enabled: false, sessions: [], pairings: [], auditLog: [] });
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState("");
  const [actionType, setActionType] = useState("");
  const [selector, setSelector] = useState("");
  const [text, setText] = useState("");
  const refreshGateway = useCallback(async () => {
    const result = await api.get<any>("client-gateway-snapshot");
    if (!result.ok) {
      setStatus(result.error ?? "Client gateway could not be loaded.");
      return;
    }
    const next = result.payload ?? { enabled: false, sessions: [], pairings: [], auditLog: [] };
    setSnapshot(next);
    const sessions = next.sessions ?? [];
    setSelectedSessionId((current) => sessions.some((session: any) => session.sessionId === current) ? current : sessions[0]?.sessionId ?? "");
  }, [api]);
  useEffect(() => {
    void refreshGateway();
    const interval = window.setInterval(() => void refreshGateway(), 2500);
    return () => window.clearInterval(interval);
  }, [refreshGateway]);
  const sessions = snapshot.sessions ?? [];
  const selectedSession = sessions.find((session: any) => session.sessionId === selectedSessionId) ?? sessions[0];
  const pairings = snapshot.pairings ?? [];
  const trustedClients = snapshot.trustedClients ?? [];
  const actionTypes = uniqueStrings((selectedSession?.capabilities ?? []).flatMap((capability: any) => capability.actionTypes ?? []));
  useEffect(() => {
    if (!actionType && actionTypes.length) setActionType(actionTypes[0] ?? "");
  }, [actionType, actionTypes]);
  const startRecording = async () => {
    if (!selectedSession) return;
    setStatus("Starting client recording...");
    const result = await api.post<any>("start-client-recording", { sessionId: selectedSession.sessionId, projectId: props.projectId, authorizationPin: pin });
    setStatus(result.ok ? `Recording ${result.payload?.recording?.recordingId ?? "started"}.` : result.error ?? "Recording could not start.");
    if (result.ok) {
      setPin("");
      await refreshGateway();
    }
  };
  const stopRecording = async () => {
    if (!selectedSession) return;
    setStatus("Stopping client recording...");
    const result = await api.post<any>("stop-client-recording", { sessionId: selectedSession.sessionId, authorizationPin: pin });
    setStatus(result.ok ? `Recording ${result.payload?.recording?.recordingId ?? "stopped"}.` : result.error ?? "Recording could not stop.");
    if (result.ok) {
      setPin("");
      await refreshGateway();
    }
  };
  const captureSnapshot = async () => {
    if (!selectedSession) return;
    const result = await api.post("capture-client-snapshot", { sessionId: selectedSession.sessionId, kind: "dom" });
    setStatus(result.ok ? "Snapshot request queued." : result.error ?? "Snapshot request failed.");
    if (result.ok) await refreshGateway();
  };
  const executeAction = async () => {
    if (!selectedSession || !actionType) return;
    setStatus("Sending action...");
    const parameters: Record<string, unknown> = {};
    if (selector.trim()) parameters.selector = selector.trim();
    if (text) parameters.text = text;
    const command: Record<string, unknown> = { actionType, parameters, timeoutMs: 10_000 };
    if (selector.trim()) command.target = { type: "selector", selector: selector.trim() };
    const result = await api.post<any>("execute-client-action", { sessionId: selectedSession.sessionId, authorizationPin: pin, command });
    setStatus(result.ok ? `Action ${result.payload?.result?.status ?? "completed"}.` : result.error ?? "Action failed.");
    if (result.ok) {
      setPin("");
      await refreshGateway();
    }
  };
  const revokeTrust = async (trustedClientId: string) => {
    if (pin.length < 4) {
      setStatus("Enter your PIN before revoking client trust.");
      return;
    }
    const result = await api.post("revoke-client-trust", { trustedClientId, authorizationPin: pin });
    setStatus(result.ok ? "Client trust revoked." : result.error ?? "Client trust could not be revoked.");
    if (result.ok) {
      setPin("");
      await refreshGateway();
    }
  };
  return (
    <section className="automation-client-gateway-view">
      <header>
        <div><strong>Client Gateway</strong><span>{snapshot.webRuntime?.clientGatewayPublicUrl ?? snapshot.publicUrl ?? "Host WebSocket URL"} | {snapshot.webRuntime?.clientGatewayListening === false ? "not listening" : `${sessions.length} connected`}</span></div>
        <button className="button compact" onClick={() => void refreshGateway()} type="button"><RefreshCcw size={13} aria-hidden />Refresh</button>
      </header>
      <div className="automation-client-gateway-grid">
        <section className="automation-client-panel">
          <header><QrCode size={14} aria-hidden /><strong>Approval</strong></header>
          {snapshot.webRuntime?.clientGatewayError ? <VisualAlert tone="warning" title="Gateway port issue" message={snapshot.webRuntime.clientGatewayError} /> : null}
          <p className="muted-text">Open the extension and click connect. Approve pending requests from the global web-panel popup.</p>
          <div className="automation-client-pairings">
            {pairings.slice(0, 4).map((pairing: any) => (
              <span key={pairing.pairingCode}>
                <strong>{pairing.referenceCode ?? pairing.pairingCode}</strong>
                <small>{pairing.consumedAt ? "Paired" : pairing.requestedByClientName ? `${pairing.requestedByClientName} | expires ${formatTime(pairing.expiresAt)}` : `Expires ${formatTime(pairing.expiresAt)}`}</small>
              </span>
            ))}
            {!pairings.length ? <span><strong>No approval requests</strong><small>Waiting for an extension/client connect request.</small></span> : null}
          </div>
          <div className="automation-client-pairings">
            {trustedClients.slice(0, 6).map((client: any) => (
              <span key={client.trustedClientId}>
                <strong>{client.name}</strong>
                <small>{client.status} | approved {formatTime(client.approvedAt)} | expires {formatTime(client.expiresAt)}</small>
                {client.status === "active" ? <button className="button compact" onClick={() => void revokeTrust(client.trustedClientId)} type="button">Revoke</button> : null}
              </span>
            ))}
            {!trustedClients.length ? <span><strong>No trusted clients</strong><small>Approved clients will appear here.</small></span> : null}
          </div>
        </section>
        <section className="automation-client-panel wide">
          <header><Radio size={14} aria-hidden /><strong>Connected Clients</strong></header>
          <div className="automation-client-list">
            {sessions.map((session: any) => (
              <button className={selectedSession?.sessionId === session.sessionId ? "selected" : ""} key={session.sessionId} onClick={() => setSelectedSessionId(session.sessionId)} type="button">
                <span><strong>{session.name}</strong><small>{session.clientType} | {session.status}</small></span>
                <StatusBadge value={session.activeRecordingId ? "recording" : session.capabilities?.length ? "ready" : "idle"} />
              </button>
            ))}
            {!sessions.length ? <span>No clients connected yet.</span> : null}
          </div>
        </section>
        <section className="automation-client-panel">
          <header><Radio size={14} aria-hidden /><strong>Recording</strong></header>
          <Field label="PIN"><input inputMode="numeric" onChange={(event) => setPin(digits(event.target.value))} value={pin} /></Field>
          <div className="inline-actions">
            <button className="button" disabled={!selectedSession || pin.length < 4} onClick={() => void startRecording()} type="button">Start</button>
            <button className="button" disabled={!selectedSession || pin.length < 4} onClick={() => void stopRecording()} type="button">Stop</button>
            <button className="button" disabled={!selectedSession} onClick={() => void captureSnapshot()} type="button">Snapshot</button>
          </div>
          <KeyValue rows={[
            ["Selected", selectedSession?.name ?? "none"],
            ["Recording", selectedSession?.activeRecordingId ?? "none"],
            ["Last seen", selectedSession?.lastSeenAt ? formatTime(selectedSession.lastSeenAt) : "-"]
          ]} />
        </section>
        <section className="automation-client-panel wide">
          <header><Zap size={14} aria-hidden /><strong>Action Test</strong></header>
          <Field label="Action"><select value={actionType} onChange={(event) => setActionType(event.target.value)}>{actionTypes.map((item) => <option key={item} value={item}>{item}</option>)}{!actionTypes.length ? <option value="">No client actions</option> : null}</select></Field>
          <Field label="Selector"><input placeholder="CSS selector or client target selector" value={selector} onChange={(event) => setSelector(event.target.value)} /></Field>
          <Field label="Text"><input value={text} onChange={(event) => setText(event.target.value)} /></Field>
          <button className="button button-primary" disabled={!selectedSession || !actionType || pin.length < 4} onClick={() => void executeAction()} type="button">Send Action</button>
        </section>
      </div>
      <StatusText value={status} />
    </section>
  );
}


