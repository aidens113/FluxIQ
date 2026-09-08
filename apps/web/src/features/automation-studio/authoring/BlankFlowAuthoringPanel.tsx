"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Field, Modal } from "../../programs/shared-ui";
import { blankFlowAuthoringRequest, BLANK_FLOW_AUTHORING_LIMITS, type BlankFlowAuthoringReadiness } from "./blank-flow-authoring-model";

export type BlankFlowAuthoringCommands = {
  preflightLlm(payload: Record<string, any>): Promise<any>;
  issueLlmGrant(payload: Record<string, any>): Promise<any>;
  generateBootstrap(payload: { projectId: string; flowId: string; llmExecutionGrantId: string }): Promise<any>;
};

export function BlankFlowAuthoringPanel(props: {
  projectId: string | null;
  flow: any;
  readiness: BlankFlowAuthoringReadiness;
  commands: BlankFlowAuthoringCommands;
  onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void;
}) {
  const request = useMemo(() => blankFlowAuthoringRequest(props.projectId, props.flow, props.readiness), [props.flow, props.projectId, props.readiness]);
  const [preflightState, setPreflightState] = useState<"idle" | "checking" | "ready" | "rejected">("idle");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const generationRef = useRef(0);

  const clearCredentials = () => { setPassword(""); setPin(""); };
  useEffect(() => {
    const generation = ++generationRef.current;
    clearCredentials();
    setOpen(false);
    setError("");
    if (!request.ok) { setPreflightState("idle"); return; }
    setPreflightState("checking");
    void props.commands.preflightLlm(request.payload).then((result) => {
      if (generationRef.current !== generation) return;
      setPreflightState(result.ok && result.payload?.preflight ? "ready" : "rejected");
    }).catch(() => {
      if (generationRef.current === generation) setPreflightState("rejected");
    });
  }, [props.commands, request]);

  if (!request.ok || preflightState !== "ready") return null;
  const close = () => {
    if (busy) return;
    clearCredentials();
    setError("");
    setOpen(false);
  };
  const authorize = async () => {
    if (!password || pin.length < 4) { clearCredentials(); setError("Password and security PIN are required."); return; }
    const authorizationPassword = password;
    const authorizationPin = pin;
    clearCredentials();
    setBusy(true);
    setError("");
    try {
      const preflight = await props.commands.preflightLlm(request.payload);
      if (!preflight.ok || !preflight.payload?.preflight) { setError("Flow authoring preflight was rejected. Review the saved limits and enabled key."); return; }
      const issued = await props.commands.issueLlmGrant({ ...request.payload, authorizationPassword, authorizationPin, maxUses: 1 });
      const grantId = issued.payload?.grant?.grantId;
      if (!issued.ok || typeof grantId !== "string" || !grantId) { setError("Flow authoring authorization failed. Verify your password, PIN, and enabled key."); return; }
      const generated = await props.commands.generateBootstrap({ projectId: request.payload.projectId, flowId: request.payload.flowId, llmExecutionGrantId: grantId });
      const adaptation = generated.payload?.adaptation;
      if (!generated.ok || adaptation?.status !== "proposed" || typeof adaptation?.adaptationId !== "string") { setError("Flow authoring could not create a reviewable adaptation."); return; }
      setOpen(false);
      setError("");
      props.onOpenAdaptation?.(adaptation.flowId ?? request.payload.flowId, adaptation.adaptationId);
    } catch {
      setError("Flow authoring could not be completed.");
    } finally {
      setBusy(false);
      clearCredentials();
    }
  };

  return <section aria-label="Build Flow from instructions" className="automation-runtime-run-panel">
    <header><div><strong>Build Flow from instructions</strong><span>Create a proposed Router and Subflow structure from this blank Flow&apos;s active instructions.</span></div></header>
    <div className="automation-runtime-run-command"><div><small>The generated Flow remains pending until you review and apply its Adaptation.</small></div><button className="button button-primary" onClick={() => { clearCredentials(); setError(""); setOpen(true); }} type="button">Build Flow from instructions</button></div>
    {open ? <Modal busy={busy} closeOnEscape={!busy} title="Authorize Flow Build" onClose={close}><div className="automation-modal-form">
      <p className="automation-router-modal-intro">Authorize one DeepSeek build request. It creates a pending Adaptation only and cannot auto-apply changes.</p>
      <dl aria-label="Flow build request limits"><div><dt>Input tokens</dt><dd>{BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxInputTokens}</dd></div><div><dt>Output tokens</dt><dd>{BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxOutputTokens}</dd></div><div><dt>Total tokens</dt><dd>{BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxTotalTokens}</dd></div><div><dt>Calls</dt><dd>{BLANK_FLOW_AUTHORING_LIMITS.maxCalls}</dd></div><div><dt>Timeout</dt><dd>20 seconds</dd></div><div><dt>Maximum cost</dt><dd>$0.25</dd></div><div><dt>Provider retries</dt><dd>{BLANK_FLOW_AUTHORING_LIMITS.providerRetryCount}</dd></div></dl>
      {error ? <p className="automation-runtime-message" role="alert">{error}</p> : null}
      <Field label="Account password" required><input aria-label="Account password" autoComplete="current-password" autoFocus disabled={busy} onChange={(event) => { setPassword(event.target.value); setError(""); }} type="password" value={password} /></Field>
      <Field label="Security PIN" required><input aria-label="Security PIN" autoComplete="off" disabled={busy} inputMode="numeric" maxLength={12} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }} type="password" value={pin} /></Field>
      <div className="modal-actions"><button className="button" disabled={busy} onClick={close} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={busy || !password || pin.length < 4} onClick={() => void authorize()} type="button">{busy ? "Building..." : "Authorize One Build"}</button></div>
    </div></Modal> : null}
  </section>;
}
