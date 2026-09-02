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
        <div><strong>Client Gateway</strong><span>{snapshot.webRuntime?.clientGatewayListening === false ? "Unavailable" : `${controller.pages.sessions.total} connected`}{controller.loading ? " | refreshing" : ""}</span></div>
        <button className="button compact" disabled={controller.loading} onClick={() => void controller.refreshGateway()} type="button"><RefreshCcw size={13} aria-hidden />Refresh</button>
      </header>
      <div className="automation-client-gateway-grid">
        <section className="automation-client-panel">
          <header><QrCode size={14} aria-hidden /><strong>Approval</strong></header>
          {snapshot.webRuntime?.clientGatewayError ? <VisualAlert tone="warning" title="Gateway port issue" message={snapshot.webRuntime.clientGatewayError} /> : null}
          <p className="muted-text">Open the extension and connect, then verify that the reference code below matches the requesting client.</p>
          <ClientSearch kind="pairings" label="Search approval requests" controller={controller} />
          <div className="automation-client-pairings">
            {pairings.map((pairing: any) => (
              <span key={pairing.pairingCode}>
                <strong>{pairing.referenceCode ?? pairing.pairingCode}</strong>
                <small>{pairing.consumedAt ? "Paired" : pairing.requestedByClientName ? `${pairing.requestedByClientName} | expires ${formatClientTime(pairing.expiresAt)}` : `Expires ${formatClientTime(pairing.expiresAt)}`}</small>
                {!pairing.consumedAt ? <span className="inline-actions"><button className="button compact" disabled={Boolean(controller.pairingBusyCode)} onClick={() => void controller.resolvePairing(pairing.pairingCode, "approve")} type="button">Approve</button><button className="button compact" disabled={Boolean(controller.pairingBusyCode)} onClick={() => void controller.resolvePairing(pairing.pairingCode, "reject")} type="button">Reject</button></span> : null}
              </span>
            ))}
            {!pairings.length ? <span><strong>No approval requests</strong><small>Waiting for an extension/client connect request.</small></span> : null}
          </div>
          <ClientPageControls kind="pairings" controller={controller} />
          <ClientSearch kind="trustedClients" label="Search trusted clients" controller={controller} />
          <div className="automation-client-pairings">
            {trustedClients.map((client: any) => (
              <span key={client.trustedClientId}>
                <strong>{client.name}</strong>
                <small>{client.status} | approved {formatClientTime(client.approvedAt)} | expires {formatClientTime(client.expiresAt)}</small>
                {client.status === "active" ? <button className="button compact" onClick={() => controller.requestAuthorization("revoke", client.trustedClientId)} type="button">Revoke</button> : null}
              </span>
            ))}
            {!trustedClients.length ? <span><strong>No trusted clients</strong><small>Approved clients will appear here.</small></span> : null}
          </div>
          <ClientPageControls kind="trustedClients" controller={controller} />
        </section>
        <section className="automation-client-panel wide">
          <header><Radio size={14} aria-hidden /><strong>Connected Clients</strong></header>
          <ClientSearch kind="sessions" label="Search connected clients" controller={controller} />
          <div className="automation-client-list">
            {controller.sessions.map((session: any) => (
              <button className={controller.selectedSession?.sessionId === session.sessionId ? "selected" : ""} key={session.sessionId} onClick={() => controller.setSelectedSessionId(session.sessionId)} type="button">
                <span><strong>{session.name ?? session.sessionId}</strong><small>{session.clientType ?? "Client"} | {session.status ?? "unknown"}</small></span>
                <StatusBadge value={session.activeRecordingId ? "recording" : session.capabilities?.length ? "ready" : "idle"} />
              </button>
            ))}
            {!controller.sessions.length ? <span>No clients connected yet.</span> : null}
          </div>
          <ClientPageControls kind="sessions" controller={controller} />
          {controller.selectedSessionLocation === "off-page" ? <p className="automation-client-selection-note">The selected client is on another page. Its details remain pinned.</p> : controller.selectedSessionLocation === "checking" ? <p className="automation-client-selection-note">Checking the selected client...</p> : controller.selectedSessionLocation === "missing" ? <p className="automation-client-selection-note missing" role="alert">The selected client disconnected or was removed. Choose another client.</p> : null}
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
      <details className="automation-client-diagnostics"><summary>Connection details</summary><KeyValue rows={[["Gateway endpoint", snapshot.webRuntime?.clientGatewayPublicUrl ?? snapshot.publicUrl ?? "Host default"], ["Listening", snapshot.webRuntime?.clientGatewayListening === false ? "No" : "Yes"], ["Host module", snapshot.webRuntime?.hostModuleLoaded ? "Loaded" : "Not loaded"], ["Native nodes", String(snapshot.webRuntime?.automationStudio?.nativeNodeDefinitionCount ?? 0)], ["Recording mappers", String(snapshot.webRuntime?.automationStudio?.recordingMapperCount ?? 0)]]} />{snapshot.webRuntime?.automationStudio?.nativeImporterRuntimeBound === false ? <VisualAlert tone="warning" title="Compatibility importer unavailable" message="Legacy recording mapping is unavailable in the current host runtime." /> : null}</details>
      <StatusText value={controller.status} />
      {controller.pendingAction ? <AuthorizationDialog actionLabel={clientAuthorizationCopy(controller.pendingAction.kind).action} busy={controller.authorizationBusy} credentials={controller.credentials} description={clientAuthorizationCopy(controller.pendingAction.kind).description} error={controller.authorizationError} requirements={{ pin: true }} title={clientAuthorizationCopy(controller.pendingAction.kind).title} onAuthorize={() => void controller.authorizeAction()} onCancel={() => !controller.authorizationBusy && controller.setPendingAction(null)} onChange={controller.setCredentials} /> : null}
    </section>
  );
}

function ClientPageControls(props: { kind: "sessions" | "pairings" | "trustedClients"; controller: ReturnType<typeof useClientGatewayController> }) {
  const page = props.controller.pages[props.kind];
  if (props.controller.itemErrors[props.kind]) return <div className="automation-runtime-pagination-footer"><span role="alert">{props.controller.itemErrors[props.kind]}</span><button className="button compact" onClick={() => void props.controller.submitSearch(props.kind)} type="button">Retry</button></div>;
  if (page.total <= 50) return page.search ? <div className="automation-runtime-pagination-footer"><span>{page.total} matching result{page.total === 1 ? "" : "s"}</span></div> : null;
  const start = page.index * 50 + 1;
  const end = Math.min(page.total, start + 49);
  return <div className="automation-runtime-pagination-footer"><span>{start}-{end} of {page.total}</span><div className="automation-runtime-pagination"><button disabled={page.index === 0} onClick={() => void props.controller.navigateItems(props.kind, "previous")} type="button">Previous</button><button disabled={!page.hasMore} onClick={() => void props.controller.navigateItems(props.kind, "next")} type="button">Next</button></div></div>;
}

function ClientSearch(props: { kind: "sessions" | "pairings" | "trustedClients"; label: string; controller: ReturnType<typeof useClientGatewayController> }) {
  return <form className="automation-client-search" onSubmit={(event) => { event.preventDefault(); void props.controller.submitSearch(props.kind); }}><input aria-label={props.label} onChange={(event) => props.controller.setSearchDrafts((current) => ({ ...current, [props.kind]: event.target.value }))} placeholder={props.label} type="search" value={props.controller.searchDrafts[props.kind]} /><button className="button compact" type="submit">Search</button></form>;
}
