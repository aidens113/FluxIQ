"use client";

import { QrCode, Radio, RefreshCcw, Zap } from "lucide-react";
import { AuthorizationDialog, Field, KeyValue, StatusBadge, StatusText, VisualAlert } from "../../programs/shared-ui";
import { clientAuthorizationCopy } from "./client-model";
import { formatClientTime } from "./client-format";
import { useClientGatewayController } from "./useClientGatewayController";

export function ClientGatewayView(props: { active: boolean; projectId: string | null }) {
  const controller = useClientGatewayController(props);
  const snapshot = controller.snapshot;
  const pairings = snapshot.pairings ?? [];
  const trustedClients = snapshot.trustedClients ?? [];
  return (
    <section className="automation-client-gateway-view">
      <header>
        <div><strong>Client Gateway</strong><span>{snapshot.webRuntime?.clientGatewayPublicUrl ?? snapshot.publicUrl ?? "Host WebSocket URL"} | {snapshot.webRuntime?.clientGatewayListening === false ? "not listening" : `${controller.sessions.length} connected`}{controller.loading ? " | refreshing" : ""}</span></div>
        <button className="button compact" disabled={controller.loading} onClick={() => void controller.refreshGateway()} type="button"><RefreshCcw size={13} aria-hidden />Refresh</button>
      </header>
      <div className="automation-client-gateway-grid">
        <section className="automation-client-panel">
          <header><QrCode size={14} aria-hidden /><strong>Approval</strong></header>
          {snapshot.webRuntime?.clientGatewayError ? <VisualAlert tone="warning" title="Gateway port issue" message={snapshot.webRuntime.clientGatewayError} /> : null}
          {snapshot.webRuntime?.automationStudio?.nativeImporterRuntimeBound === false ? <VisualAlert tone="warning" title="Importer runtime not bound" message={`Legacy recording-mapper compatibility cannot run until the host module binds an AutomationStudioNativeNodeRuntime. Host module loaded: ${snapshot.webRuntime.hostModuleLoaded ? "yes" : "no"}. Native nodes: ${snapshot.webRuntime.automationStudio.nativeNodeDefinitionCount ?? 0}. Recording mappers: ${snapshot.webRuntime.automationStudio.recordingMapperCount ?? 0}.`} /> : null}
          <p className="muted-text">Open the extension and connect, then verify that the reference code below matches the requesting client.</p>
          <div className="automation-client-pairings">
            {pairings.slice(0, 4).map((pairing: any) => (
              <span key={pairing.pairingCode}>
                <strong>{pairing.referenceCode ?? pairing.pairingCode}</strong>
                <small>{pairing.consumedAt ? "Paired" : pairing.requestedByClientName ? `${pairing.requestedByClientName} | expires ${formatClientTime(pairing.expiresAt)}` : `Expires ${formatClientTime(pairing.expiresAt)}`}</small>
                {!pairing.consumedAt ? <span className="inline-actions"><button className="button compact" disabled={Boolean(controller.pairingBusyCode)} onClick={() => void controller.resolvePairing(pairing.pairingCode, "approve")} type="button">Approve</button><button className="button compact" disabled={Boolean(controller.pairingBusyCode)} onClick={() => void controller.resolvePairing(pairing.pairingCode, "reject")} type="button">Reject</button></span> : null}
              </span>
            ))}
            {!pairings.length ? <span><strong>No approval requests</strong><small>Waiting for an extension/client connect request.</small></span> : null}
          </div>
          <div className="automation-client-pairings">
            {trustedClients.slice(0, 6).map((client: any) => (
              <span key={client.trustedClientId}>
                <strong>{client.name}</strong>
                <small>{client.status} | approved {formatClientTime(client.approvedAt)} | expires {formatClientTime(client.expiresAt)}</small>
                {client.status === "active" ? <button className="button compact" onClick={() => controller.requestAuthorization("revoke", client.trustedClientId)} type="button">Revoke</button> : null}
              </span>
            ))}
            {!trustedClients.length ? <span><strong>No trusted clients</strong><small>Approved clients will appear here.</small></span> : null}
          </div>
        </section>
        <section className="automation-client-panel wide">
          <header><Radio size={14} aria-hidden /><strong>Connected Clients</strong></header>
          <div className="automation-client-list">
            {controller.sessions.map((session: any) => (
              <button className={controller.selectedSession?.sessionId === session.sessionId ? "selected" : ""} key={session.sessionId} onClick={() => controller.setSelectedSessionId(session.sessionId)} type="button">
                <span><strong>{session.name ?? session.sessionId}</strong><small>{session.clientType ?? "Client"} | {session.status ?? "unknown"}</small></span>
                <StatusBadge value={session.activeRecordingId ? "recording" : session.capabilities?.length ? "ready" : "idle"} />
              </button>
            ))}
            {!controller.sessions.length ? <span>No clients connected yet.</span> : null}
          </div>
        </section>
        <section className="automation-client-panel">
          <header><Radio size={14} aria-hidden /><strong>Recording</strong></header>
          <div className="inline-actions">
            <button className="button" disabled={!controller.selectedSession || Boolean(controller.selectedSession?.activeRecordingId)} onClick={() => controller.requestAuthorization("start")} type="button">Start</button>
            <button className="button" disabled={!controller.selectedSession || !controller.selectedSession?.activeRecordingId} onClick={() => controller.requestAuthorization("stop")} type="button">Stop</button>
            <button className="button" disabled={!controller.selectedSession} onClick={() => void controller.captureSnapshot()} type="button">Snapshot</button>
          </div>
          <KeyValue rows={[["Selected", controller.selectedSession?.name ?? controller.selectedSession?.sessionId ?? "none"], ["Recording", controller.selectedSession?.activeRecordingId ?? "none"], ["Last seen", controller.selectedSession?.lastSeenAt ? formatClientTime(controller.selectedSession.lastSeenAt) : "-"]]} />
        </section>
        <section className="automation-client-panel wide">
          <header><Zap size={14} aria-hidden /><strong>Action Test</strong></header>
          <Field label="Action"><select value={controller.actionType} onChange={(event) => controller.setActionType(event.target.value)}>{controller.actionTypes.map((item) => <option key={item} value={item}>{item}</option>)}{!controller.actionTypes.length ? <option value="">No client actions</option> : null}</select></Field>
          <Field label="Selector"><input placeholder="CSS selector or client target selector" value={controller.selector} onChange={(event) => controller.setSelector(event.target.value)} /></Field>
          <Field label="Text"><input value={controller.text} onChange={(event) => controller.setText(event.target.value)} /></Field>
          <button className="button button-primary" disabled={!controller.selectedSession || !controller.actionType} onClick={() => controller.requestAuthorization("execute")} type="button">Send Action</button>
        </section>
      </div>
      <StatusText value={controller.status} />
      {controller.pendingAction ? <AuthorizationDialog actionLabel={clientAuthorizationCopy(controller.pendingAction.kind).action} busy={controller.authorizationBusy} credentials={controller.credentials} description={clientAuthorizationCopy(controller.pendingAction.kind).description} error={controller.authorizationError} requirements={{ pin: true }} title={clientAuthorizationCopy(controller.pendingAction.kind).title} onAuthorize={() => void controller.authorizeAction()} onCancel={() => !controller.authorizationBusy && controller.setPendingAction(null)} onChange={controller.setCredentials} /> : null}
    </section>
  );
}