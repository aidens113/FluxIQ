"use client";
import { parseAutomationStudioCandidateAuthoringResult, type AutomationStudioCandidateAuthoringResult } from "fluxiq/automation-studio/candidate-authoring";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, parseAutomationStudioActionPermissionRequest, type AutomationStudioActionPermissionRequest } from "fluxiq/automation-studio/action-permissions";
import { Modal } from "../../programs/shared-ui";
import { AUTOMATION_LLM_PROGRESS_LABELS, type BlankFlowAuthoringReadiness } from "./blank-flow-authoring-model";
import { existingFlowImprovementRequest, IMPROVEMENT_INSTRUCTION_MAX_LENGTH } from "./existing-flow-improvement";
import type { FlowImprovementCommands } from "./improvement-host";

type Phase = "idle" | "preparing" | "improving";

/** What the person has already been asked and has answered for this wording. */
type Continuation = { text: string; permission: AutomationStudioActionPermissionRequest };

function improvementFailureMessage(result: any): string {
  const code = typeof result?.payload?.diagnostic?.code === "string" ? result.payload.diagnostic.code : "";
  if (code === "flow_bootstrap.pending_adaptation_exists") return "A suggested change is already waiting for review. Accept or reject it in Suggested changes first, then ask again.";
  if (code === "flow_bootstrap.blank_target_required") return "FluxIQ could not tell which part of this automation to improve. It improves an automation with one main part; open Subflows and mark the one to improve as primary.";
  if (code === "flow_bootstrap.provider_timeout") return "The model request timed out. Keep the browser connected and try again.";
  if (code === "flow_bootstrap.evidence_iteration_limit" || code === "flow_bootstrap.evidence_limit") return "FluxIQ reached its limit before it found the change. Say more precisely what should be different, then try again.";
  if (code === "flow_bootstrap.evidence_tool_failed" || code === "flow_bootstrap.evidence_runtime_unavailable") return "The connected browser could not try this out. Check that the website's tab is still open, then try again.";
  if (code === "flow_bootstrap.user_intervention_required") return "The website showed a check only you can complete, and it was not completed. Complete it in the browser, then try again.";
  return "FluxIQ did not come back with a candidate draft. Check the connected browser and what you asked for, then try again.";
}

/**
 * Improving an automation that already has steps, in the person's own words.
 *
 * FluxIQ saves what they said as one more instruction on the Flow, opens the
 * website, and comes back with a suggested change to the Flow's own steps
 * (Core's `extend`), which opens in Suggested changes for review. Nothing
 * about the Flow changes until that change is accepted there.
 */
export function ImproveFlowPanel(props: {
  projectId: string | null;
  flow: any;
  readiness: BlankFlowAuthoringReadiness;
  commands: FlowImprovementCommands;
  onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void;
}) {
  const request = useMemo(() => existingFlowImprovementRequest(props.projectId, props.flow, props.readiness), [props.flow, props.projectId, props.readiness]);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [candidate, setCandidate] = useState<AutomationStudioCandidateAuthoringResult | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Continuation | null>(null);
  const saved = useRef<{ instructionId: string; text: string } | null>(null);
  const flowKey = `${props.projectId ?? ""}/${props.flow?.flowId ?? ""}`;
  const scopeRef = useRef(flowKey);
  const generationRef = useRef(0);
  if (scopeRef.current !== flowKey) { scopeRef.current = flowKey; generationRef.current += 1; }
  useEffect(() => () => { generationRef.current += 1; }, []);

  useEffect(() => {
    setText("");
    setPhase("idle");
    setCandidate(null);
    setError("");
    setPending(null);
    saved.current = null;
  }, [flowKey]);

  if (!request.ok) return null;
  const busy = phase === "preparing" || phase === "improving";
  const wording = text.trim();

  const improve = async (continuation?: Continuation) => {
    if (!wording || (continuation && continuation.text !== wording)) {
      setPending(null);
      if (continuation) setError("What you asked for changed. Ask again to start a new improvement.");
      return;
    }
    const { projectId, flowId } = request.payload;
    const generation = ++generationRef.current;
    const current = () => generationRef.current === generation;
    setPending(null);
    setError("");
    setPhase("preparing");
    try {
      // Saved once per wording. A reworded request updates the instruction it
      // replaces, so the Flow is never left asked for two versions of it.
      if (saved.current?.text !== wording) {
        const stored = await props.commands.saveImprovementInstruction({ projectId, flowId, instruction: wording, ...(saved.current ? { instructionId: saved.current.instructionId } : {}) });
        if (!current()) return;
        const instructionId = stored?.payload?.instruction?.instructionId;
        if (!stored?.ok || typeof instructionId !== "string" || stored.payload.instruction.status !== "active") {
          setPhase("idle");
          setError(stored?.error ? `What you asked for could not be saved: ${stored.error}` : "What you asked for could not be saved.");
          return;
        }
        saved.current = { instructionId, text: wording };
      }
      setPhase("improving");
      // Only what the person allowed in answer to this improvement's own request.
      const generated = await props.commands.improveFromWebsite({ projectId, flowId, ...(continuation ? { permittedConsequences: [...continuation.permission.missing] } : {}) });
      if (!current()) return;
      if (generated?.ok) {
        const draft = parseAutomationStudioCandidateAuthoringResult(generated.payload, { projectId, flowId });
        if (!draft) { setPhase("idle"); setError("The build did not return a valid candidate draft for this Flow."); return; }
        setCandidate(draft); setPhase("idle"); return;
      }
      setPhase("idle");
      const asked = generated?.payload?.diagnostic?.code === "flow_bootstrap.permission_required"
        ? parseAutomationStudioActionPermissionRequest(generated.payload.diagnostic.permissionRequest)
        : null;
      if (asked?.reason.stage === "authoring") {
        setPending({ text: wording, permission: asked });
        return;
      }
      setError(improvementFailureMessage(generated));
    } catch (failure) {
      if (!current()) return;
      setPhase("idle");
      const reported = failure instanceof Error && failure.message ? failure.message : String(failure);
      setError(`Something went wrong while improving this automation: ${reported}`);
    }
  };

  const confirmingPermission = pending?.permission ?? null;

  return <section aria-label="Improve this automation" className="automation-runtime-run-panel automation-flow-authoring-panel">
    <header><div><strong>Improve this automation</strong><span className="automation-flow-authoring-description">Say what it should do differently, in your own words. FluxIQ explores the website and saves a candidate draft. Verification is pending; the existing steps stay unchanged.</span></div></header>
    <label className="automation-flow-exploration-task"><span>What should change</span><textarea aria-describedby="improvement-help" aria-label="What should change" disabled={busy} maxLength={IMPROVEMENT_INSTRUCTION_MAX_LENGTH} onChange={(event) => { setText(event.target.value); setError(""); setPending(null); }} placeholder="For example: Sometimes a What's new window covers the page. When it is showing, close it first; when it is not, carry on as before." rows={4} value={text} /><small id="improvement-help">{text.length}/{IMPROVEMENT_INSTRUCTION_MAX_LENGTH} characters. This is kept with the automation as one more thing it has been asked to do.</small></label>
    <div className="automation-runtime-run-command"><div><small>The existing steps stay unchanged. Applying a candidate is unavailable until independent verification is supported.</small></div><button className="button button-primary" disabled={busy || !wording} onClick={() => void improve()} type="button">{phase === "preparing" ? "Getting ready..." : phase === "improving" ? `${AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget}...` : "Improve automation"}</button></div>
    {phase === "improving" ? <div className="automation-flow-exploration-progress"><progress aria-label={AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget} /> <span aria-atomic="true" aria-live="polite" role="status"><strong>{AUTOMATION_LLM_PROGRESS_LABELS.inspectingLiveTarget}.</strong> Keep the browser and the website's tab connected.</span></div> : null}
    {candidate && candidate.projectId === props.projectId && candidate.flowId === props.flow?.flowId ? <p role="status" data-candidate-id={candidate.candidateId}>Saved candidate draft (revision {candidate.revision}). Verification pending. The Flow?s steps are unchanged.</p> : null}
    {error ? <p className="automation-runtime-message" role="alert">{error}</p> : null}
    {confirmingPermission ? <Modal busy={busy} closeOnEscape={!busy} title="Confirm what the change may do" onClose={() => setPending(null)}><div className="automation-modal-form">
      <p className="automation-router-modal-intro">{confirmingPermission.sentence}</p>
      <ul aria-label="Consequences requiring approval">{confirmingPermission.missing.map((consequence) => <li key={consequence}>{AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]}</li>)}</ul>
      <p>Nothing has been changed yet. Carrying on allows only the things listed above.</p>
      <div className="modal-actions"><button className="button" onClick={() => setPending(null)} type="button">Cancel</button><button className="button button-primary" data-modal-submit onClick={() => { const next = pending; if (next) void improve(next); }} type="button">Allow and continue</button></div>
    </div></Modal> : null}
  </section>;
}
