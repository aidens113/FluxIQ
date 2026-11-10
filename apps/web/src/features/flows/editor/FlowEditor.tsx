"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { loadFlowFacts } from "../data";
import { appendPoint, graphEditorHref, mayWords, statusLine, stepViews } from "../model";
import { useLoaded } from "../use-loaded";
import { flowSummaries, type FlowSummary } from "../wire";
import { EditBanner } from "./EditBanner";
import { focusAssistant } from "./focus-assistant";
import { HistoryDrawer } from "./HistoryDrawer";
import { InterfaceCard } from "./InterfaceCard";
import { RunControl } from "./RunControl";
import { AddStep, StepActionsHandle, StepList, type StepActions } from "./steps";
import { useFlowEditor } from "./use-flow-editor";
import { usePublishFlow } from "./use-publish-flow";
import { useRun } from "./use-run";

/** One Flow: what it does, whether it works as it stands, what it needs and gives, and its numbered steps to read and change. */
export function FlowEditor(props: { projectId: string; flowId: string }) {
  const studio = useProgramTransport("automation-studio");
  const flow = useMemo(() => ({ projectId: props.projectId, flowId: props.flowId }), [props.projectId, props.flowId]);
  const facts = useLoaded(`${flow.projectId}/${flow.flowId}`, useCallback((signal: AbortSignal) => loadFlowFacts(studio, flow, signal), [studio, flow]));
  const editor = useFlowEditor(studio, flow);
  const run = useRun(studio, flow, facts.reload);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const answer = editor.outline.state === "ready" ? editor.outline.data : undefined;
  const changedSteps = editor.banner?.kind === "conflict" ? editor.banner.conflict.steps : undefined;
  const views = useMemo(() => (answer ? stepViews(answer.outline, { projectId: flow.projectId, ...(changedSteps ? { changedSteps } : {}) }) : []), [answer, flow.projectId, changedSteps]);
  usePublishFlow(flow, views, selected);

  const others = useRef<Promise<FlowSummary[]> | undefined>(undefined);
  const otherFlows = useCallback(() => {
    others.current ??= studio.post("list-flow-summaries", { projectId: flow.projectId }).then((response) => {
      const flows = response.ok ? flowSummaries(response.payload) : undefined;
      if (!flows) {
        // Asked again next time rather than remembered as failed.
        others.current = undefined;
        throw new Error(response.error ?? "The project's Flows could not be read.");
      }
      return flows.filter((candidate) => candidate.flowId !== flow.flowId);
    });
    return others.current;
  }, [studio, flow]);
  const toggleSelected = useCallback((key: string) => setSelected((was) => {
    const next = new Set(was);
    if (!next.delete(key)) next.add(key);
    return next;
  }), []);
  const actions = useMemo<StepActions>(() => ({
    studio,
    flow,
    needs: answer?.outline.interface.needs ?? [],
    edit: editor.edit,
    busy: editor.busy,
    ...(editor.refusal ? { refusal: editor.refusal } : {}),
    selected,
    toggleSelected,
    otherFlows
  }), [studio, flow, answer, editor.edit, editor.busy, editor.refusal, selected, toggleSelected, otherFlows]);

  const known = facts.state === "ready" ? facts.data : undefined;
  const name = known?.name ?? "This Flow";
  // A save here re-reads the Flow's facts, so the status line compares the engine's own times; until the
  // re-read lands, this page's save stands in for it.
  const [coveredSave, setCoveredSave] = useState<number>();
  const { reload: reloadFacts } = facts;
  useEffect(() => {
    if (editor.savedAt !== undefined) reloadFacts();
  }, [editor.savedAt, reloadFacts]);
  const savedHere = useRef(editor.savedAt);
  savedHere.current = editor.savedAt;
  useEffect(() => setCoveredSave(savedHere.current), [known]);
  const savedAt = savedAtOf(known?.savedAt, editor.savedAt !== coveredSave ? editor.savedAt : undefined);
  const status = answer && known && known.runsRead
    ? statusLine({ ...(known.lastRun ? { lastRun: known.lastRun } : {}), revision: answer.revision, ...(savedAt === undefined ? {} : { savedAt }), now: Date.now() })
    : undefined;
  const runWhole = () => (answer?.outline.interface.needs.length ? run.ask() : void run.start({}));

  return (
    <div className="flows flows-editor">
      <nav className="flows-crumbs" aria-label="Breadcrumb">
        <Link href="/flows">Flows</Link> <span aria-hidden="true">›</span> <span aria-current="page">{name}</span>
      </nav>
      <div className="flows-title">
        <h1>{name}</h1>
        <RunControl run={run.run} needs={answer?.outline.interface.needs ?? []} ask={run.ask} cancel={run.cancel} start={(inputs) => void run.start(inputs)} />
      </div>
      {facts.state === "error" ? <p className="flows-note flows-error" role="alert">This Flow’s details could not be loaded: {facts.message} <button type="button" onClick={facts.reload}>Try again</button></p> : null}
      <p className="flows-what"><strong>What it does:</strong> {known ? known.whatItDoes ?? "No description yet. Ask FluxIQ to write one." : "…"}</p>
      <p className="flows-status" data-tone={status?.tone ?? "neutral"} role="status">
        <span>{status ? status.text : known && !known.runsRead ? `How it last ran could not be read${answer ? ` · version ${answer.revision}` : ""}` : "…"}</span>
        <button type="button" className="flows-tool" aria-expanded={historyOpen} disabled={!answer} onClick={() => setHistoryOpen((was) => !was)}>History</button>
      </p>
      {historyOpen && answer ? (
        <HistoryDrawer studio={studio} flow={flow} currentRevision={answer.revision} onClose={() => setHistoryOpen(false)} onRestored={(revision, from) => {
          setHistoryOpen(false);
          editor.restored(revision, from);
        }} />
      ) : null}
      {answer ? (
        <InterfaceCard needs={answer.outline.interface.needs} gives={answer.outline.interface.gives} may={mayWords(answer.outline, known?.sites ?? [])} fromCode={known?.fromCode ?? false} {...(known?.declaredIn ? { declaredIn: known.declaredIn } : {})} />
      ) : null}
      {editor.banner ? (
        <EditBanner banner={editor.banner} busy={editor.busy} {...(editor.refusal?.at === "banner" ? { refusal: editor.refusal.reason } : {})} undo={() => void editor.undo()} applyAgain={() => void editor.applyAgain()} toggleChanges={editor.toggleChanges} dismiss={editor.dismiss} runWhole={runWhole} />
      ) : null}
      <section className="flows-steps-section" aria-labelledby="flows-steps-heading" aria-busy={editor.outline.state === "loading" || editor.busy}>
        <h2 id="flows-steps-heading">Steps</h2>
        {editor.outline.state === "loading" ? <p className="flows-note">Loading the steps…</p> : null}
        {editor.outline.state === "error" ? <p className="flows-note flows-error" role="alert">The steps could not be loaded: {editor.outline.message}</p> : null}
        {answer ? (
          <StepActionsHandle.Provider value={actions}>
            {views.length ? <StepList steps={views} label="Steps of this Flow" /> : <p className="flows-note">This Flow has no steps yet.</p>}
            {answer.outline.issues.length ? (
              <ul className="flows-issues" aria-label="Parts the list cannot show plainly">
                {answer.outline.issues.map((issue, index) => (
                  <li key={index}>{issue.step ? `Step ${issue.step}: ` : ""}{issue.words}. <a href={graphEditorHref(flow.projectId, flow.flowId)}>Open the graph</a></li>
                ))}
              </ul>
            ) : null}
            {editor.refusal?.at === "append" ? <p className="flows-refusal" role="alert">Not saved: {editor.refusal.reason}</p> : null}
            <div className="flows-tool-row flows-foot">
              <button type="button" className="flows-button" aria-expanded={adding} onClick={() => setAdding((was) => !was)}>+ Add a step</button>
              <button type="button" className="flows-button" onClick={() => focusAssistant(document)}>
                Ask FluxIQ to change this Flow…
              </button>
            </div>
            {adding ? <AddStep {...withAfter(appendPoint(answer.outline))} at="append" onDone={() => setAdding(false)} /> : null}
            {selected.size ? <p className="flows-note">{selected.size === 1 ? "1 step is picked" : `${selected.size} steps are picked`}: the assistant will know which you mean.</p> : null}
          </StepActionsHandle.Provider>
        ) : null}
      </section>
      <details className="flows-advanced">
        <summary>Advanced</summary>
        <p><a href={graphEditorHref(flow.projectId, flow.flowId)}>Open this Flow in the graph editor</a></p>
      </details>
    </div>
  );
}

function withAfter(after: string | undefined): { after?: string } {
  return after === undefined ? {} : { after };
}

/** The later of when the Flow was last saved (from its history) and when this page last saved it. */
function savedAtOf(stored: number | undefined, here: number | undefined): number | undefined {
  if (stored === undefined) return here;
  if (here === undefined) return stored;
  return Math.max(stored, here);
}
