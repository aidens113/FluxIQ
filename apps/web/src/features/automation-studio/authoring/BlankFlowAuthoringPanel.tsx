"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../programs/shared-ui";
import { AUTOMATION_LLM_PROGRESS_LABELS, blankFlowAuthoringRequest, blankFlowExplorationRequest, BLANK_FLOW_AUTHORING_LIMITS, llmRequestRequiresHighTokenWarning, WEBSITE_EXPLORATION_LIMITS, WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS, type BlankFlowAuthoringReadiness } from "./blank-flow-authoring-model";

const WEBSITE_EXPLORATION_INSTRUCTION_MAX_LENGTH = 4_000;

function generationFailureMessage(result: any, mode: "build" | "explore"): string {
  const code = typeof result?.payload?.diagnostic?.code === "string" ? result.payload.diagnostic.code : "";
  if (code === "flow_bootstrap.provider_timeout") return "The model request timed out. Keep the browser connected and try again.";
  if (code === "flow_bootstrap.evidence_iteration_limit" || code === "flow_bootstrap.evidence_limit") return "Exploration reached its evidence limit before it could create a proposal. Start closer to the target page or make the website task more specific, then try again.";
  if (code === "flow_bootstrap.evidence_tool_failed") return "The connected browser could not complete an exploration action. Check that the target tab is still available, then try again.";
  if (code === "flow_bootstrap.evidence_cancelled") return "Exploration was interrupted. Keep the browser connected and try again.";
  return mode === "explore"
    ? "Website exploration did not create a Flow proposal. Check the connected browser and task, then try again."
    : "Flow authoring did not create a reviewable proposal. Check the active instructions and try again.";
}

export type BlankFlowAuthoringCommands = {
  preflightLlm(payload: Record<string, any>): Promise<any>;
  issueLlmGrant(payload: Record<string, any>): Promise<any>;
  generateBootstrap(payload: { projectId: string; flowId: string; llmExecutionGrantId: string }): Promise<any>;
  saveGenerationInstruction(payload: { projectId: string; flowId: string; instruction: string }): Promise<any>;
  generateFromWebsite(payload: { projectId: string; flowId: string; llmExecutionGrantId: string }): Promise<any>;
};

export function BlankFlowAuthoringPanel(props: {
  projectId: string | null;
  flow: any;
  readiness: BlankFlowAuthoringReadiness;
  commands: BlankFlowAuthoringCommands;
  onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void;
}) {
  const buildRequest = useMemo(() => blankFlowAuthoringRequest(props.projectId, props.flow, props.readiness), [props.flow, props.projectId, props.readiness]);
  const explorationRequest = useMemo(() => blankFlowExplorationRequest(props.projectId, props.flow, props.readiness), [props.flow, props.projectId, props.readiness]);
  const preflightRequest = explorationRequest.ok ? explorationRequest : buildRequest;
  const [preflightState, setPreflightState] = useState<"idle" | "checking" | "ready" | "rejected">("idle");
  const [open, setOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"build" | "explore">("build");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [instruction, setInstruction] = useState("");
  const [explorationPhase, setExplorationPhase] = useState<"idle" | "authorizing" | "exploring" | "review">("idle");
  const [explorationElapsedSeconds, setExplorationElapsedSeconds] = useState(0);
  const [preflightRevision, setPreflightRevision] = useState(0);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    setOpen(false);
    setError("");
    setExplorationPhase("idle");
    if (!preflightRequest.ok) { setPreflightState("idle"); return; }
    setPreflightState("checking");
    void props.commands.preflightLlm(preflightRequest.payload).then((result) => {
      if (generationRef.current !== generation) return;
      setPreflightState(result.ok && result.payload?.preflight ? "ready" : "rejected");
    }).catch(() => {
      if (generationRef.current === generation) setPreflightState("rejected");
    });
  }, [preflightRequest, preflightRevision, props.commands]);

  useEffect(() => setInstruction(""), [props.flow?.flowId]);
  useEffect(() => {
    if (explorationPhase !== "exploring") { setExplorationElapsedSeconds(0); return; }
    const startedAt = Date.now();
    const updateElapsed = () => setExplorationElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    updateElapsed();
    const interval = globalThis.setInterval(updateElapsed, 1_000);
    return () => globalThis.clearInterval(interval);
  }, [explorationPhase]);

  if (!explorationRequest.ok && !buildRequest.ok) return null;
  const close = () => {
    if (busy) return;
    setError("");
    setOpen(false);
  };
  const generate = async (mode: "build" | "explore", highTokenConfirmation = false) => {
    const request = mode === "build" ? buildRequest : explorationRequest;
    const normalizedInstruction = instruction.trim();
    if (!request.ok || (mode === "explore" && !normalizedInstruction)) return;
    setBusy(true);
    setError("");
    if (mode === "explore") setExplorationPhase("authorizing");
    try {
      if (mode === "explore") {
        const saved = await props.commands.saveGenerationInstruction({ projectId: request.payload.projectId, flowId: request.payload.flowId, instruction: normalizedInstruction });
        if (!saved.ok || saved.payload?.instruction?.status !== "active") { setExplorationPhase("idle"); setError("The website task could not be saved for exploration."); return; }
      }
      const preflight = await props.commands.preflightLlm(request.payload);
      if (!preflight.ok || !preflight.payload?.preflight) { if (mode === "explore") setExplorationPhase("idle"); setError("Flow authoring preflight was rejected. Review the saved limits and enabled key."); return; }
      if (llmRequestRequiresHighTokenWarning(preflight.payload) && !highTokenConfirmation) { setPendingMode(mode); setOpen(true); if (mode === "explore") setExplorationPhase("idle"); return; }
      const issued = await props.commands.issueLlmGrant({
        ...request.payload,
        ...(highTokenConfirmation ? { highTokenConfirmation: true } : {}),
        maxUses: mode === "explore" ? WEBSITE_EXPLORATION_LIMITS.maxCalls : 1,
        ...(mode === "explore" ? { ttlMs: WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS } : {})
      });
      const grantId = issued.payload?.grant?.grantId;
      if (!issued.ok || typeof grantId !== "string" || !grantId) { if (mode === "explore") setExplorationPhase("idle"); setError("Flow authoring authorization failed. Verify your session and enabled key."); return; }
      if (mode === "explore") setExplorationPhase("exploring");
      const generated = mode === "explore"
        ? await props.commands.generateFromWebsite({ projectId: request.payload.projectId, flowId: request.payload.flowId, llmExecutionGrantId: grantId })
        : await props.commands.generateBootstrap({ projectId: request.payload.projectId, flowId: request.payload.flowId, llmExecutionGrantId: grantId });
      const adaptation = generated.payload?.adaptation;
      if (!generated.ok || adaptation?.status !== "proposed" || typeof adaptation?.adaptationId !== "string") { if (mode === "explore") setExplorationPhase("idle"); setError(generationFailureMessage(generated, mode)); return; }
      setOpen(false);
      setError("");
      if (mode === "explore") setExplorationPhase("review");
      props.onOpenAdaptation?.(adaptation.flowId ?? request.payload.flowId, adaptation.adaptationId);
    } catch {
      if (mode === "explore") setExplorationPhase("idle");
      setError("Flow authoring could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return <section aria-label="Build Flow from instructions" className="automation-runtime-run-panel">
    <header><div><strong>Build Flow from instructions</strong><span className="automation-flow-authoring-description">{explorationRequest.ok ? "Describe the result you want, then let the connected browser gather evidence and propose the Flow." : "Create a proposed Router and Subflow structure from this blank Flow's active instructions."}</span></div></header>
    {preflightState === "checking" ? <div className="automation-flow-exploration-progress"><progress aria-label="Checking Flow authoring availability" /> <span aria-atomic="true" aria-live="polite" role="status">Checking Flow authoring availability...</span></div> : null}
    {preflightState === "rejected" ? <div className="automation-runtime-message" role="alert"><strong>Flow authoring is not available.</strong> Check the enabled model key and saved Flow limits, then retry. <button className="button" onClick={() => setPreflightRevision((value) => value + 1)} type="button">Retry availability check</button></div> : null}
    {preflightState === "ready" && explorationRequest.ok ? <><label className="automation-flow-exploration-task"><span>Website task</span><textarea aria-describedby="website-task-help" aria-label="Website task" disabled={busy} maxLength={WEBSITE_EXPLORATION_INSTRUCTION_MAX_LENGTH} onChange={(event) => { setInstruction(event.target.value); setError(""); setExplorationPhase("idle"); }} placeholder="For example: Find a product, add it to the cart, and capture the order total." rows={4} value={instruction} /><small id="website-task-help">{instruction.length}/{WEBSITE_EXPLORATION_INSTRUCTION_MAX_LENGTH} characters. This instruction is saved with the proposal for review.</small></label>
    <div className="automation-runtime-run-command"><div><small>Browser actions happen on the connected website during exploration. The generated Flow remains a proposal and is never applied until you review it.</small><small>Up to {WEBSITE_EXPLORATION_LIMITS.maxCalls} model calls at {WEBSITE_EXPLORATION_LIMITS.timeoutMs / 1_000} seconds per call.</small></div><button className="button button-primary" disabled={busy || !instruction.trim()} onClick={() => void generate("explore")} type="button">{explorationPhase === "authorizing" ? "Preparing exploration..." : explorationPhase === "exploring" ? `${AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget}...` : "Explore and create proposal"}</button></div></> : null}
    {explorationPhase === "authorizing" ? <div className="automation-flow-exploration-progress"><progress aria-label="Preparing website exploration" /> <span aria-atomic="true" aria-live="polite" role="status">Preparing a bounded exploration request. The generated Flow will still require review.</span></div> : null}
    {explorationPhase === "exploring" ? <div className="automation-flow-exploration-progress"><progress aria-label={AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget} /> <span aria-atomic="true" aria-live="polite" role="status"><strong>{AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget}.</strong> Collecting bounded page evidence; {AUTOMATION_LLM_PROGRESS_LABELS.generatingProposal.toLowerCase()} follows in this request. Keep the browser and target tab connected.</span> <span aria-hidden="true">({explorationElapsedSeconds}s elapsed)</span></div> : null}
    {explorationPhase === "review" ? <p className="automation-runtime-message" role="status"><strong>{AUTOMATION_LLM_PROGRESS_LABELS.readyForReview}.</strong> No generated changes have been applied. Review the Router, Subflows, and actions before applying the Adaptation.</p> : null}
    {preflightState === "ready" && buildRequest.ok ? <div className="automation-runtime-run-command"><div><small>Or build a proposal from the Flow&apos;s existing active instructions without exploring a website.</small></div><button className="button" disabled={busy} onClick={() => void generate("build")} type="button">{busy && explorationPhase === "idle" ? `${AUTOMATION_LLM_PROGRESS_LABELS.generatingProposal}...` : "Build proposal from active instructions"}</button></div> : null}
    {error && !open ? <p className="automation-runtime-message" role="alert">{error}</p> : null}
    {open ? <Modal busy={busy} closeOnEscape={!busy} title="Confirm high-token Flow Build" onClose={close}><div className="automation-modal-form">
      <p className="automation-router-modal-intro">This request can use more than 100,000 tokens. Review the configured limits before continuing.</p>
      <dl aria-label="Flow build request limits"><div><dt>Input tokens per call</dt><dd>{pendingMode === "explore" ? WEBSITE_EXPLORATION_LIMITS.tokenLimits.maxInputTokens : BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxInputTokens}</dd></div><div><dt>Output tokens per call</dt><dd>{pendingMode === "explore" ? WEBSITE_EXPLORATION_LIMITS.tokenLimits.maxOutputTokens : BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxOutputTokens}</dd></div><div><dt>Total tokens per call</dt><dd>{pendingMode === "explore" ? WEBSITE_EXPLORATION_LIMITS.tokenLimits.maxTotalTokens : BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxTotalTokens}</dd></div><div><dt>Calls</dt><dd>{pendingMode === "explore" ? WEBSITE_EXPLORATION_LIMITS.maxCalls : BLANK_FLOW_AUTHORING_LIMITS.maxCalls}</dd></div><div><dt>Timeout per call</dt><dd>{(pendingMode === "explore" ? WEBSITE_EXPLORATION_LIMITS.timeoutMs : BLANK_FLOW_AUTHORING_LIMITS.timeoutMs) / 1_000} seconds</dd></div><div><dt>Maximum total cost</dt><dd>${pendingMode === "explore" ? WEBSITE_EXPLORATION_LIMITS.maxTotalEstimatedCostUsd.toFixed(2) : BLANK_FLOW_AUTHORING_LIMITS.maxEstimatedCostUsd.toFixed(2)}</dd></div><div><dt>Provider retries</dt><dd>{BLANK_FLOW_AUTHORING_LIMITS.providerRetryCount}</dd></div></dl>
      {error ? <p className="automation-runtime-message" role="alert">{error}</p> : null}
      <div className="modal-actions"><button className="button" disabled={busy} onClick={close} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={busy} onClick={() => void generate(pendingMode, true)} type="button">{busy ? "Building..." : "Continue high-token build"}</button></div>
    </div></Modal> : null}
  </section>;
}
