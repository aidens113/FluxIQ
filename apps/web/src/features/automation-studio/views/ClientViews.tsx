"use client";

import { QrCode, Radio, RefreshCcw, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateFlowTypeScript } from "fluxiq/automation-studio/dsl/generator";
import { useProgramApi } from "../../programs/program-api";
import { AuthorizationDialog, Field, KeyValue, StatusBadge, StatusText, VisualAlert } from "../../programs/shared-ui";
import type { AutomationFlowConfigExtension } from "../types";
import { InspectorSection } from "./InspectorView";
import { formatTime, uniqueStrings } from "./view-utils";
const pendingFlowConfigExtensions: AutomationFlowConfigExtension[] = [
  {
    id: "runtime-defaults",
    title: "Runtime defaults",
    owner: "global",
    description: "Global Flow execution knobs that apply unless a node overrides them.",
    fields: [
      { id: "timeoutMs", label: "Timeout", valueType: "number", description: "Maximum milliseconds before the Flow times out." },
      { id: "maxConcurrency", label: "Maximum concurrency", valueType: "number", description: "How many runs may execute at once." }
    ]
  }
];

export function AutomationConfigView(props: { configs?: any[]; flow: any; policy: any; projectId: string | null; onRefresh?(): Promise<void> }) {
  const api = useProgramApi("automation-studio");
  const flow = props.flow;
  const [name, setName] = useState(flow?.name ?? "");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [visibility, setVisibility] = useState(flow?.visibility ?? "private");
  const [timeoutMs, setTimeoutMs] = useState(flow?.executionDefaults?.timeoutMs ? String(flow.executionDefaults.timeoutMs) : "");
  const [maxConcurrency, setMaxConcurrency] = useState(flow?.executionDefaults?.maxConcurrency ? String(flow.executionDefaults.maxConcurrency) : "");
  const [moduleId, setModuleId] = useState(flow?.source?.mode === "code" ? flow.source.moduleId : `flows/${flow?.flowId ?? "flow"}.flow.ts`);
  const [sourceText, setSourceText] = useState(flow?.flowId ? generateFlowTypeScript(flow) : "");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ kind: "start" | "stop" | "execute" | "revoke"; trustedClientId?: string } | null>(null);
  const [credentials, setCredentials] = useState({ password: "", pin: "", totp: "" });
  const [authorizationError, setAuthorizationError] = useState("");
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [pairingBusyCode, setPairingBusyCode] = useState("");
  const refreshRequestRef = useRef(0);
  useEffect(() => {
    setName(flow?.name ?? "");
    setDescription(flow?.description ?? "");
    setVisibility(flow?.visibility ?? "private");
    setTimeoutMs(flow?.executionDefaults?.timeoutMs ? String(flow.executionDefaults.timeoutMs) : "");
    setMaxConcurrency(flow?.executionDefaults?.maxConcurrency ? String(flow.executionDefaults.maxConcurrency) : "");
    setModuleId(flow?.source?.mode === "code" ? flow.source.moduleId : `flows/${flow?.flowId ?? "flow"}.flow.ts`);
    setSourceText(flow?.flowId ? generateFlowTypeScript(flow) : "");
    setStatus("");
  }, [flow?.flowId, flow?.updatedAt, flow?.source?.mode]);
  const configId = flow?.flowId ? `flow.${flow.flowId}.config` : props.policy?.policyId ? `policy.${props.policy.policyId}.config` : "project.default.config";
  const generatedConfig = (props.configs ?? []).find((config: any) => config?.metadata?.ownerKind === "flow" && config?.metadata?.flowId === flow?.flowId)
    ?? (props.configs ?? []).find((config: any) => config?.configId === configId);
  const configPath = generatedConfig?.metadata?.relativePath
    ?? (flow?.source?.mode === "code" && flow.source.moduleId ? flow.source.moduleId : `configs/${configId}/config.json`);
  const sourcePath = flow?.source?.mode === "code"
    ? `source/${flow.source.moduleId}`
    : flow?.metadata?.generatedSource?.relativePath ?? (flow?.flowId ? `source/flows/${flow.flowId}.flow.ts` : "-");
  const sourceMode = flow?.source?.mode ?? "visual";
  const saveFlowSettings = async () => {
    if (!props.projectId || !flow?.flowId) return;
    const authorizationPin = window.prompt("Enter PIN to save Flow config") ?? "";
    if (authorizationPin.length < 4) { setStatus("PIN is required before saving Flow config."); return; }
    setStatus("Saving Flow config...");
    const executionDefaults = {
      ...(flow.executionDefaults ?? {}),
      ...(timeoutMs.trim() ? { timeoutMs: Number(timeoutMs) } : {}),
      ...(maxConcurrency.trim() ? { maxConcurrency: Number(maxConcurrency) } : {})
    };
    if (!timeoutMs.trim()) delete (executionDefaults as any).timeoutMs;
    if (!maxConcurrency.trim()) delete (executionDefaults as any).maxConcurrency;
    const nextFlow = {
      ...flow,
      name: name.trim() || flow.name,
      ...(description.trim() ? { description: description.trim() } : { description: undefined }),
      visibility,
      executionDefaults
    };
    const result = await api.post<{ flow: any }>("save-flow", { projectId: props.projectId, flow: nextFlow, authorizationPin });
    setStatus(result.ok ? "Flow config saved." : result.error ?? "Flow config could not be saved.");
    if (result.ok) await props.onRefresh?.();
  };
  const makeCodeAuthoritative = async () => {
    if (!props.projectId || !flow?.flowId) return;
    const authorizationPin = window.prompt("Enter PIN to make code authoritative") ?? "";
    if (authorizationPin.length < 4) { setStatus("PIN is required before changing source ownership."); return; }
    setStatus("Compiling Flow source...");
    const result = await api.post<any>("compile-flow-source", { projectId: props.projectId, flowId: flow.flowId, moduleId, sourceText, authorizationPin });
    if (!result.ok || !result.payload?.compilation?.ok) {
      setStatus(result.error ?? result.payload?.compilation?.diagnostics?.map((item: any) => `${item.location ? `${item.location.moduleId}:${item.location.line}:${item.location.column} ` : ""}${item.code}: ${item.message}`).join("; ") ?? "Flow source could not be compiled.");
      return;
    }
    setStatus("Code is now authoritative for this Flow.");
    await props.onRefresh?.();
  };
  const makeVisualAuthoritative = async () => {
    if (!props.projectId || !flow?.flowId) return;
    const authorizationPin = window.prompt("Enter PIN to make visual graph authoritative") ?? "";
    if (authorizationPin.length < 4) { setStatus("PIN is required before changing source ownership."); return; }
    setStatus("Converting Flow to visual ownership...");
    const result = await api.post<any>("convert-flow-to-visual", { projectId: props.projectId, flowId: flow.flowId, authorizationPin });
    setStatus(result.ok ? "Visual graph is now authoritative." : result.error ?? "Flow could not be converted.");
    if (result.ok) await props.onRefresh?.();
  };
  return (
    <section className="automation-config-view">
      <header className="automation-config-editor-header">
        <div><strong>Flow Configuration</strong><span>{flow?.name ?? "No Flow selected"}</span></div>
        <button className="button button-primary" disabled={!flow?.flowId || sourceMode === "code"} onClick={() => void saveFlowSettings()} type="button">Save Config</button>
      </header>
      <StatusText value={status} />
      <section className="automation-config-form">
        <label><span>Name</span><input disabled={sourceMode === "code"} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Description</span><textarea disabled={sourceMode === "code"} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label><span>Visibility</span><select disabled={sourceMode === "code"} value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private draft</option><option value="public" disabled={flow?.publication?.status !== "published" && flow?.publication?.status !== "deprecated"}>Public published</option></select></label>
        <label><span>Timeout (ms)</span><input disabled={sourceMode === "code"} inputMode="numeric" value={timeoutMs} onChange={(event) => setTimeoutMs(event.target.value.replace(/[^\d]/g, ""))} placeholder="Default" /></label>
        <label><span>Maximum concurrency</span><input disabled={sourceMode === "code"} inputMode="numeric" value={maxConcurrency} onChange={(event) => setMaxConcurrency(event.target.value.replace(/[^\d]/g, ""))} placeholder="Default" /></label>
      </section>
      {sourceMode === "code" ? <VisualAlert tone="warning" title="Code authoritative" message="Flow config is compiled from the source module. Convert to visual ownership before editing these fields here." /> : null}
      <section className="automation-config-source-editor">
        <header><div><strong>Source Ownership</strong><span>{sourceMode === "code" ? "Code module is authoritative." : "Visual graph is authoritative; generated source is reviewable."}</span></div></header>
        <InspectorSection title="Config File" rows={[["Config", generatedConfig?.configId ?? configId], ["Generated path", configPath], ["Source file", sourcePath], ["Owner", flow?.flowId ?? props.policy?.policyId ?? "default"], ["Scope", flow?.scope?.kind === "domain" ? `domain:${flow.scope.domainId}` : flow?.scope?.kind ?? "project"], ["Status", generatedConfig ? "Generated" : "Pending next Flow save"]]} />
        <label><span>Module ID</span><input value={moduleId} onChange={(event) => setModuleId(event.target.value)} /></label>
        <label><span>Flow DSL Source</span><textarea rows={12} value={sourceText} onChange={(event) => setSourceText(event.target.value)} /></label>
        <div className="inline-actions">
          <button className="button button-primary" disabled={!flow?.flowId || sourceMode === "code"} onClick={() => void makeCodeAuthoritative()} type="button">Make Code Authoritative</button>
          <button className="button" disabled={!flow?.flowId || sourceMode !== "code"} onClick={() => void makeVisualAuthoritative()} type="button">Make Visual Authoritative</button>
        </div>
      </section>
      <InspectorSection title="Flow Inputs" rows={(flow?.interface?.inputs ?? []).map((input: any) => [input.name ?? input.id, input.valueType?.kind ?? input.valueType ?? "unknown"]).concat((flow?.interface?.inputs ?? []).length ? [] : [["None", "No declared inputs"]])} />
      <InspectorSection title="Flow Outputs" rows={(flow?.interface?.outputs ?? []).map((output: any) => [output.name ?? output.id, output.valueType?.kind ?? output.valueType ?? "unknown"]).concat((flow?.interface?.outputs ?? []).length ? [] : [["None", "No declared outputs"]])} />
      <section className="automation-config-extension-list">
        <header><strong>Config Extensions</strong><span>Nodes will be able to register extra config fields here without adding an inspector inside the canvas.</span></header>
        {pendingFlowConfigExtensions.map((extension) => <article key={extension.id}><strong>{extension.title}</strong><span>{extension.owner}</span><p>{extension.description}</p><small>{extension.fields.map((field) => field.label).join(", ")}</small></article>)}
      </section>
    </section>
  );
}

export function clientAuthorizationCopy(kind: "start" | "stop" | "execute" | "revoke") {
  if (kind === "start") return { title: "Start client recording", description: "Authorize a new recording for the selected connected client.", action: "Start recording" };
  if (kind === "stop") return { title: "Stop client recording", description: "Finalize the selected client's active recording as Flow evidence.", action: "Stop recording" };
  if (kind === "execute") return { title: "Send client action", description: "Authorize the configured test action on the selected connected client.", action: "Send action" };
  return { title: "Revoke client trust", description: "Disconnect this trusted client and require a new pairing approval before it can reconnect.", action: "Revoke trust" };
}

export function AutomationClientGatewayView(props: { active: boolean; projectId: string | null }) {
  const api = useProgramApi("automation-studio");
  const [snapshot, setSnapshot] = useState<any>({ enabled: false, sessions: [], pairings: [], auditLog: [] });
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ kind: "start" | "stop" | "execute" | "revoke"; trustedClientId?: string } | null>(null);
  const [credentials, setCredentials] = useState({ password: "", pin: "", totp: "" });
  const [authorizationError, setAuthorizationError] = useState("");
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [pairingBusyCode, setPairingBusyCode] = useState("");
  const refreshRequestRef = useRef(0);
  const [actionType, setActionType] = useState("");
  const [selector, setSelector] = useState("");
  const [text, setText] = useState("");
  const refreshGateway = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    setLoading(true);
    const result = await api.get<any>("client-gateway-snapshot");
    if (refreshRequestRef.current !== requestId) return;
    setLoading(false);
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
    if (!props.active) return;
    void refreshGateway();
    const interval = window.setInterval(() => void refreshGateway(), 5000);
    return () => window.clearInterval(interval);
  }, [props.active, refreshGateway]);
  const sessions = snapshot.sessions ?? [];
  const selectedSession = sessions.find((session: any) => session.sessionId === selectedSessionId) ?? sessions[0];
  const pairings = snapshot.pairings ?? [];
  const trustedClients = snapshot.trustedClients ?? [];
  const actionTypes = uniqueStrings((selectedSession?.capabilities ?? []).flatMap((capability: any) => capability.actionTypes ?? []));
  useEffect(() => {
    if (!actionType && actionTypes.length) setActionType(actionTypes[0] ?? "");
  }, [actionType, actionTypes]);
  const startRecording = async (authorizationPin: string) => {
    if (!selectedSession) return;
    setStatus("Starting client recording...");
    const result = await api.post<any>("start-client-recording", { sessionId: selectedSession.sessionId, projectId: props.projectId, authorizationPin });
    setStatus(result.ok ? `Recording ${result.payload?.recording?.recordingId ?? "started"}.` : result.error ?? "Recording could not start.");
    if (result.ok) {
      await refreshGateway();
    }
  };
  const stopRecording = async (authorizationPin: string) => {
    if (!selectedSession) return;
    setStatus("Stopping client recording...");
    const result = await api.post<any>("stop-client-recording", { sessionId: selectedSession.sessionId, authorizationPin });
    setStatus(result.ok ? `Recording ${result.payload?.recording?.recordingId ?? "stopped"}.` : result.error ?? "Recording could not stop.");
    if (result.ok) {
      const recordingId = result.payload?.recording?.recordingId;
      if (props.projectId && recordingId) {
        setStatus(`Recording ${recordingId} stopped and is available as Flow evidence.`);
      }
      await refreshGateway();
    }
  };
  const captureSnapshot = async () => {
    if (!selectedSession) return;
    const result = await api.post("capture-client-snapshot", { sessionId: selectedSession.sessionId, kind: "dom" });
    setStatus(result.ok ? "Snapshot request queued." : result.error ?? "Snapshot request failed.");
    if (result.ok) await refreshGateway();
  };
  const executeAction = async (authorizationPin: string) => {
    if (!selectedSession || !actionType) return;
    setStatus("Sending action...");
    const parameters: Record<string, unknown> = {};
    if (selector.trim()) parameters.selector = selector.trim();
    if (text) parameters.text = text;
    const command: Record<string, unknown> = { actionType, parameters, timeoutMs: 10_000 };
    if (selector.trim()) command.target = { type: "selector", selector: selector.trim() };
    const result = await api.post<any>("execute-client-action", { sessionId: selectedSession.sessionId, authorizationPin, command });
    setStatus(result.ok ? `Action ${result.payload?.result?.status ?? "completed"}.` : result.error ?? "Action failed.");
    if (result.ok) {
      await refreshGateway();
    }
  };
  const revokeTrust = async (trustedClientId: string, authorizationPin: string) => {
    const result = await api.post("revoke-client-trust", { trustedClientId, authorizationPin });
    setStatus(result.ok ? "Client trust revoked." : result.error ?? "Client trust could not be revoked.");
    if (result.ok) {
      await refreshGateway();
    }
  };
  const requestAuthorization = (kind: "start" | "stop" | "execute" | "revoke", trustedClientId?: string) => {
    setPendingAction({ kind, ...(trustedClientId ? { trustedClientId } : {}) });
    setCredentials({ password: "", pin: "", totp: "" });
    setAuthorizationError("");
  };
  const authorizeAction = async () => {
    if (!pendingAction) return;
    setAuthorizationBusy(true);
    setAuthorizationError("");
    if (pendingAction.kind === "start") await startRecording(credentials.pin);
    if (pendingAction.kind === "stop") await stopRecording(credentials.pin);
    if (pendingAction.kind === "execute") await executeAction(credentials.pin);
    if (pendingAction.kind === "revoke" && pendingAction.trustedClientId) await revokeTrust(pendingAction.trustedClientId, credentials.pin);
    setAuthorizationBusy(false);
    setPendingAction(null);
  };
  const resolvePairing = async (pairingCode: string, action: "approve" | "reject") => {
    if (pairingBusyCode) return;
    setPairingBusyCode(pairingCode);
    setStatus(action === "approve" ? "Approving client pairing..." : "Rejecting client pairing...");
    try {
      const response = await fetch(`/api/client-gateway/${action === "approve" ? "approve-pairing" : "dismiss-pairing"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pairingCode }) });
      if (!response.ok) { const result = await response.json().catch(() => undefined) as { error?: string } | undefined; setStatus(result?.error ?? "Pairing request could not be resolved."); return; }
      setStatus(action === "approve" ? "Client paired." : "Pairing request rejected.");
      await refreshGateway();
    } catch { setStatus("The client gateway could not be reached. The pairing request remains pending."); } finally { setPairingBusyCode(""); }
  };
  return (
    <section className="automation-client-gateway-view">
      <header>
        <div><strong>Client Gateway</strong><span>{snapshot.webRuntime?.clientGatewayPublicUrl ?? snapshot.publicUrl ?? "Host WebSocket URL"} | {snapshot.webRuntime?.clientGatewayListening === false ? "not listening" : `${sessions.length} connected`}{loading ? " | refreshing" : ""}</span></div>
        <button className="button compact" disabled={loading} onClick={() => void refreshGateway()} type="button"><RefreshCcw size={13} aria-hidden />Refresh</button>
      </header>
      <div className="automation-client-gateway-grid">
        <section className="automation-client-panel">
          <header><QrCode size={14} aria-hidden /><strong>Approval</strong></header>
          {snapshot.webRuntime?.clientGatewayError ? <VisualAlert tone="warning" title="Gateway port issue" message={snapshot.webRuntime.clientGatewayError} /> : null}
          {snapshot.webRuntime?.automationStudio?.nativeImporterRuntimeBound === false
            ? <VisualAlert
                tone="warning"
                title="Importer runtime not bound"
                message={`Legacy recording-mapper compatibility cannot run until the host module binds an AutomationStudioNativeNodeRuntime. Host module loaded: ${snapshot.webRuntime.hostModuleLoaded ? "yes" : "no"}. Native nodes: ${snapshot.webRuntime.automationStudio.nativeNodeDefinitionCount ?? 0}. Recording mappers: ${snapshot.webRuntime.automationStudio.recordingMapperCount ?? 0}.`}
              />
            : null}
          <p className="muted-text">Open the extension and connect, then verify that the reference code below matches the requesting client.</p>
          <div className="automation-client-pairings">
            {pairings.slice(0, 4).map((pairing: any) => (
              <span key={pairing.pairingCode}>
                <strong>{pairing.referenceCode ?? pairing.pairingCode}</strong>
                <small>{pairing.consumedAt ? "Paired" : pairing.requestedByClientName ? `${pairing.requestedByClientName} | expires ${formatTime(pairing.expiresAt)}` : `Expires ${formatTime(pairing.expiresAt)}`}</small>
                {!pairing.consumedAt ? <span className="inline-actions"><button className="button compact" disabled={Boolean(pairingBusyCode)} onClick={() => void resolvePairing(pairing.pairingCode, "approve")} type="button">Approve</button><button className="button compact" disabled={Boolean(pairingBusyCode)} onClick={() => void resolvePairing(pairing.pairingCode, "reject")} type="button">Reject</button></span> : null}
              </span>
            ))}
            {!pairings.length ? <span><strong>No approval requests</strong><small>Waiting for an extension/client connect request.</small></span> : null}
          </div>
          <div className="automation-client-pairings">
            {trustedClients.slice(0, 6).map((client: any) => (
              <span key={client.trustedClientId}>
                <strong>{client.name}</strong>
                <small>{client.status} | approved {formatTime(client.approvedAt)} | expires {formatTime(client.expiresAt)}</small>
                {client.status === "active" ? <button className="button compact" onClick={() => requestAuthorization("revoke", client.trustedClientId)} type="button">Revoke</button> : null}
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
          <div className="inline-actions">
            <button className="button" disabled={!selectedSession || Boolean(selectedSession?.activeRecordingId)} onClick={() => requestAuthorization("start")} type="button">Start</button>
            <button className="button" disabled={!selectedSession || !selectedSession?.activeRecordingId} onClick={() => requestAuthorization("stop")} type="button">Stop</button>
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
          <button className="button button-primary" disabled={!selectedSession || !actionType} onClick={() => requestAuthorization("execute")} type="button">Send Action</button>
        </section>
      </div>
      <StatusText value={status} />
      {pendingAction ? <AuthorizationDialog actionLabel={clientAuthorizationCopy(pendingAction.kind).action} busy={authorizationBusy} credentials={credentials} description={clientAuthorizationCopy(pendingAction.kind).description} error={authorizationError} requirements={{ pin: true }} title={clientAuthorizationCopy(pendingAction.kind).title} onAuthorize={() => void authorizeAction()} onCancel={() => !authorizationBusy && setPendingAction(null)} onChange={setCredentials} /> : null}
    </section>
  );
}


