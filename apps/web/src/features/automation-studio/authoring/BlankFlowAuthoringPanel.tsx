"use client";
import { parseAutomationStudioCandidateAuthoringResult, type AutomationStudioCandidateAuthoringResult } from "fluxiq/automation-studio/candidate-authoring";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, parseAutomationStudioActionPermissionRequest, type AutomationStudioActionPermissionRequest } from "fluxiq/automation-studio/action-permissions";
import { Modal } from "../../programs/shared-ui";
import { AUTOMATION_LLM_PROGRESS_LABELS, blankFlowAuthoringRequest, blankFlowExplorationRequest, type BlankFlowAuthoringReadiness } from "./blank-flow-authoring-model";

const WEBSITE_EXPLORATION_INSTRUCTION_MAX_LENGTH = 4_000;

type PendingPermissionContinuation = {
  request: AutomationStudioActionPermissionRequest;
  projectId: string;
  flowId: string;
  instructionBody: string;
};

type PermissionContext = Pick<PendingPermissionContinuation, "projectId" | "flowId" | "instructionBody">;

function permissionMatchesContext(pending: PendingPermissionContinuation, context: PermissionContext): boolean {
  return pending.projectId === context.projectId
    && pending.flowId === context.flowId
    && pending.instructionBody === context.instructionBody;
}

function wholeNumber(value: number): string {
  return value.toLocaleString("en-US");
}

// What ends a website exploration. Core picks how many calls it may make, so
// the panel never promises a call count; it names the bounds instead.
const EXPLORATION_BOUNDS_TEXT = "The model is asked as many times as the exploration needs. "
  + "It stops when it has a proposal, when it stops making progress, or at the spending limit set for this automation, whichever comes first.";

// Core's note that a build which ran out kept its draft as an incomplete
// record (`diagnostic.evidenceLoop.incompleteDraft`): two counts, read only when
// both are positive whole numbers, so nothing else in the diagnostic is shown.
function keptDraftSentence(result: any): string {
  const kept = result?.payload?.diagnostic?.evidenceLoop?.incompleteDraft;
  const revision = kept?.revision;
  const steps = kept?.steps;
  if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(steps) || revision < 1 || steps < 1) return "";
  return ` FluxIQ kept what it worked out so far: a draft of ${wholeNumber(steps)} ${steps === 1 ? "step" : "steps"} (revision ${wholeNumber(revision)}). The next build carries on from it instead of starting over.`;
}

function generationFailureMessage(result: any, mode: "build" | "explore"): string {
  return generationFailureReason(result, mode) + keptDraftSentence(result);
}

function generationFailureReason(result: any, mode: "build" | "explore"): string {
  const code = typeof result?.payload?.diagnostic?.code === "string" ? result.payload.diagnostic.code : "";
  if (code === "flow_bootstrap.provider_timeout") return "The model request timed out. Keep the browser connected and try again.";
  if (code === "flow_bootstrap.evidence_iteration_limit" || code === "flow_bootstrap.evidence_limit") return "Exploration reached its evidence limit before it could create a proposal. Start closer to the target page or make the website task more specific, then try again.";
  if (code === "flow_bootstrap.evidence_tool_failed") return "The connected browser could not complete an exploration action. Check that the target tab is still available, then try again.";
  if (code === "flow_bootstrap.evidence_cancelled") return "Exploration was interrupted. Keep the browser connected and try again.";
  if (code === "flow_bootstrap.user_intervention_required") return "The website showed a check only you can complete, and it was not completed. Complete it in the browser, then try again.";
  return mode === "explore"
    ? "Website exploration did not create a Flow proposal. Check the connected browser and task, then try again."
    : "Flow authoring did not create a reviewable proposal. Check the active instructions and try again.";
}

export type BlankFlowAuthoringCommands = {
  generateBootstrap(payload: { projectId: string; flowId: string; permittedConsequences?: string[] }): Promise<any>;
  saveGenerationInstruction(payload: { projectId: string; flowId: string; instruction: string }): Promise<any>;
  generateFromWebsite(payload: { projectId: string; flowId: string; permittedConsequences?: string[] }): Promise<any>;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<{ flowId: string; adaptationId: string } | null>(null);
  const [candidate, setCandidate] = useState<AutomationStudioCandidateAuthoringResult | null>(null);
  const [explorationPhase, setExplorationPhase] = useState<"idle" | "authorizing" | "exploring" | "review">("idle");
  const [explorationElapsedSeconds, setExplorationElapsedSeconds] = useState(0);
  const [permissionContinuation, setPermissionContinuation] = useState<PendingPermissionContinuation | null>(null);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const permissionContextRef = useRef<PermissionContext>({ projectId: props.projectId ?? "", flowId: props.flow?.flowId ?? "", instructionBody: instruction.trim() });
  permissionContextRef.current = { projectId: props.projectId ?? "", flowId: props.flow?.flowId ?? "", instructionBody: instruction.trim() };
  const permissionRequest = permissionContinuation?.request ?? null;
  const scopeKey = JSON.stringify([props.projectId, props.flow?.flowId]);
  const scopeRef = useRef(scopeKey);
  const generationRef = useRef(0);
  if (scopeRef.current !== scopeKey) { scopeRef.current = scopeKey; generationRef.current += 1; }
  useEffect(() => () => { generationRef.current += 1; }, []);

  useEffect(() => {
    setError("");
    setExplorationPhase("idle");
  }, [buildRequest, explorationRequest]);

  useEffect(() => {
    setInstruction("");
    setBusy(false);
    setProposal(null);
    setCandidate(null);
    setPermissionContinuation(null);
    setPermissionOpen(false);
  }, [props.projectId, props.flow?.flowId]);
  useEffect(() => {
    if (explorationPhase !== "exploring") { setExplorationElapsedSeconds(0); return; }
    const startedAt = Date.now();
    const updateElapsed = () => setExplorationElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    updateElapsed();
    const interval = globalThis.setInterval(updateElapsed, 1_000);
    return () => globalThis.clearInterval(interval);
  }, [explorationPhase]);

  if (!explorationRequest.ok && !buildRequest.ok) return null;
  const generate = async (mode: "build" | "explore", continuation?: PendingPermissionContinuation) => {
    const request = mode === "build" ? buildRequest : explorationRequest;
    const normalizedInstruction = instruction.trim();
    if (!request.ok || (mode === "explore" && !normalizedInstruction)) return;
    const requestContext = { projectId: request.payload.projectId, flowId: request.payload.flowId, instructionBody: normalizedInstruction };
    if (continuation && (!permissionMatchesContext(continuation, requestContext) || !permissionMatchesContext(continuation, permissionContextRef.current))) {
      setPermissionContinuation(null);
      setPermissionOpen(false);
      setError("The website task or Flow changed. Start a new exploration before approving consequences.");
      return;
    }
    setBusy(true);
    const generation = ++generationRef.current;
    const current = () => generationRef.current === generation;
    setError("");
    if (mode === "explore") setExplorationPhase("authorizing");
    try {
      if (mode === "explore") {
        const saved = await props.commands.saveGenerationInstruction({ projectId: request.payload.projectId, flowId: request.payload.flowId, instruction: normalizedInstruction });
        if (!current()) return;
        if (!saved.ok || saved.payload?.instruction?.status !== "active") { setExplorationPhase("idle"); setError("The website task could not be saved for exploration."); return; }
      }
      if (continuation && !permissionMatchesContext(continuation, permissionContextRef.current)) {
        setPermissionContinuation(null);
        setPermissionOpen(false);
        if (mode === "explore") setExplorationPhase("idle");
        setError("The website task or Flow changed. Start a new exploration before approving consequences.");
        return;
      }
      // Only what the person allowed in answer to this build's own request.
      const permitted = continuation ? { permittedConsequences: [...continuation.request.missing] } : {};
      if (mode === "explore") setExplorationPhase("exploring");
      const generated = mode === "explore"
        ? await props.commands.generateFromWebsite({ projectId: request.payload.projectId, flowId: request.payload.flowId, ...permitted })
        : await props.commands.generateBootstrap({ projectId: request.payload.projectId, flowId: request.payload.flowId, ...permitted });
      if (!current()) return;
      if (mode === "explore" && generated.ok) {
        const draft = parseAutomationStudioCandidateAuthoringResult(generated.payload, { projectId: request.payload.projectId, flowId: request.payload.flowId });
        if (!draft) { setError("The build did not return a valid candidate draft for this Flow."); setExplorationPhase("idle"); return; }
        setCandidate(draft); setProposal(null); setExplorationPhase("idle"); return;
      }
      const adaptation = (generated.payload as { adaptation?: { status?: string; adaptationId?: string; flowId?: string } } | undefined)?.adaptation;
      if (!generated.ok || adaptation?.status !== "proposed" || typeof adaptation?.adaptationId !== "string") {
        const requested = generated.payload?.diagnostic?.code === "flow_bootstrap.permission_required"
          ? parseAutomationStudioActionPermissionRequest(generated.payload?.diagnostic?.permissionRequest)
          : null;
        if (mode === "explore") setExplorationPhase("idle");
        if (requested?.reason.stage === "authoring") {
          if (!permissionMatchesContext({ request: requested, ...requestContext }, permissionContextRef.current)) {
            setError("The website task or Flow changed. Start a new exploration before approving consequences.");
            return;
          }
          setPermissionContinuation({ request: requested, ...requestContext });
          setPermissionOpen(true);
          setError("");
          return;
        }
        setError(generationFailureMessage(generated, mode)); return;
      }
      setPermissionContinuation(null);
      setPermissionOpen(false);
      setError("");
      if (mode === "explore") setExplorationPhase("review");
      setProposal({ flowId: adaptation.flowId ?? request.payload.flowId, adaptationId: adaptation.adaptationId });
      props.onOpenAdaptation?.(adaptation.flowId ?? request.payload.flowId, adaptation.adaptationId);
    } catch {
      if (!current()) return;
      if (mode === "explore") setExplorationPhase("idle");
      setError("Something went wrong while building this. Try again.");
    } finally {
      if (current()) setBusy(false);
    }
  };

  return <section aria-label="Tell FluxIQ what to automate" className="automation-runtime-run-panel automation-flow-authoring-panel">
    <header><div><strong>Tell FluxIQ what to automate</strong><span className="automation-flow-authoring-description">{explorationRequest.ok ? "Write the job in your own words. FluxIQ opens the website, tries it out, and brings back a draft for you to check. The candidate is saved as a draft. Verification is pending; the Flow?s steps stay unchanged." : "FluxIQ will draft this automation from the notes already written for it. Nothing is saved until you check the draft."}</span></div></header>
    {explorationRequest.ok ? <><label className="automation-flow-exploration-task"><span>Website task</span><textarea aria-describedby="website-task-help" aria-label="Website task" disabled={busy} maxLength={WEBSITE_EXPLORATION_INSTRUCTION_MAX_LENGTH} onChange={(event) => { const nextInstruction = event.target.value; if (permissionContinuation && nextInstruction.trim() !== permissionContinuation.instructionBody) { setPermissionContinuation(null); setPermissionOpen(false); } setInstruction(nextInstruction); setError(""); setExplorationPhase("idle"); }} placeholder="For example: Find a product, add it to the cart, and capture the order total." rows={4} value={instruction} /><small id="website-task-help">{instruction.length}/{WEBSITE_EXPLORATION_INSTRUCTION_MAX_LENGTH} characters. What you write here is kept with the draft so you can see what was asked for.</small></label>
    <div className="automation-runtime-run-command"><div><small>Browser actions happen on the connected website while FluxIQ tries this out. What it writes is an unverified candidate draft; applying it is unavailable.</small><small>{EXPLORATION_BOUNDS_TEXT}</small></div><button className="button button-primary" disabled={busy || !instruction.trim()} onClick={() => void generate("explore")} type="button">{explorationPhase === "authorizing" ? "Preparing exploration..." : explorationPhase === "exploring" ? `${AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget}...` : "Explore and create proposal"}</button></div></> : null}
    {explorationPhase === "authorizing" ? <div className="automation-flow-exploration-progress"><progress aria-label="Preparing website exploration" /> <span aria-atomic="true" aria-live="polite" role="status">Preparing a bounded exploration request. The generated Flow will still require review.</span></div> : null}
    {explorationPhase === "exploring" ? <div className="automation-flow-exploration-progress"><progress aria-label={AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget} /> <span aria-atomic="true" aria-live="polite" role="status"><strong>{AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget}.</strong> Collecting bounded page evidence; {AUTOMATION_LLM_PROGRESS_LABELS.generatingProposal.toLowerCase()} follows in this request. Keep the browser and target tab connected.</span> <span aria-hidden="true">({explorationElapsedSeconds}s elapsed)</span></div> : null}
    {candidate && candidate.projectId === props.projectId && candidate.flowId === props.flow?.flowId ? <p role="status" data-candidate-id={candidate.candidateId}>Saved candidate draft (revision {candidate.revision}). Verification pending. The Flow?s steps are unchanged.</p> : null}
    {proposal ? <p className="automation-runtime-message" role="status"><strong>{AUTOMATION_LLM_PROGRESS_LABELS.readyForReview}.</strong> No generated changes have been applied. Review the Router, Subflows, and actions before applying the Adaptation. <button className="button" disabled={busy || !props.onOpenAdaptation} onClick={() => props.onOpenAdaptation?.(proposal.flowId, proposal.adaptationId)} type="button">Review suggested change</button></p> : null}
    {permissionRequest && !permissionOpen ? <p className="automation-runtime-message" role="status"><strong>Flow action approval is still required.</strong> No proposal was created. <button className="button" disabled={busy} onClick={() => setPermissionOpen(true)} type="button">Review requested permissions</button></p> : null}
    {buildRequest.ok ? <div className="automation-runtime-run-command"><div><small>Or draft it from the notes already written for this automation, without opening a website.</small></div><button className="button" disabled={busy} onClick={() => void generate("build")} type="button">{busy && explorationPhase === "idle" ? `${AUTOMATION_LLM_PROGRESS_LABELS.generatingProposal}...` : "Build proposal from active instructions"}</button></div> : null}
    {error ? <p className="automation-runtime-message" role="alert">{error}</p> : null}
    {permissionRequest && permissionOpen ? <Modal busy={busy} closeOnEscape={!busy} title="Confirm Flow action consequences" onClose={() => { if (!busy) setPermissionOpen(false); }}><div className="automation-modal-form">
      <p className="automation-router-modal-intro">{permissionRequest.sentence}</p>
      <ul aria-label="Consequences requiring approval">{permissionRequest.missing.map((consequence) => <li key={consequence}>{AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]}</li>)}</ul>
      <p>Nothing has been created or changed yet. Carrying on allows only the things listed above, and nothing else.</p>
      <div className="modal-actions"><button className="button" disabled={busy} onClick={() => setPermissionOpen(false)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={busy} onClick={() => { setPermissionOpen(false); if (permissionContinuation) void generate("explore", permissionContinuation); }} type="button">{busy ? "Continuing..." : "Allow and continue"}</button></div>
    </div></Modal> : null}
  </section>;
}
