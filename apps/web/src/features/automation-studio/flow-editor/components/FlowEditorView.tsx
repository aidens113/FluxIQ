"use client";

import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import type { FlowEditorProps, AutomationGraphSaveResult } from "../flow-editor-types";
import { useFlowEditorController } from "../hooks";
import { BlankFlowAuthoringPanel, blankFlowAuthoringRequest, blankFlowExplorationRequest, existingFlowImprovementRequest, ImproveFlowPanel, useFlowImprovementCommands } from "../../authoring";
import { useRuntimeExecutionCommands } from "../../runtime";

const FlowGraphCanvas = lazy(() => import("./FlowGraphCanvas").then((module) => ({
  default: module.FlowGraphCanvas
})));

export type { AutomationGraphSaveResult };

/**
 * The canonical connector adds the current project and the top-level Flow so
 * the pane a person lands on can host the product's primary job - saying what
 * they want automated - instead of an empty box that claims to be loading.
 */
export type FlowEditorViewProps = FlowEditorProps & {
  projectId?: string | null;
  authoringFlow?: any;
  /**
   * Opens the create-an-automation dialog. Supplied by the connector, because
   * creating a Flow belongs to the hierarchy rather than to this view. Without
   * it the start pane can only say where the `+` button is; with it, the pane
   * that has nothing to show offers the thing it is waiting for.
   */
  onCreateFlow?(): void;
};

type StartPaneReadiness = { loading: boolean; instructions: any[]; router: any | null; subflowTotal: number; error: string };

const idleReadiness: StartPaneReadiness = { loading: false, instructions: [], router: null, subflowTotal: 0, error: "" };

export const FlowEditorView = memo(function FlowEditorView(props: FlowEditorViewProps) {
  const loadError = props.taskGraph?.metadata?.detailLoadError;
  if (typeof loadError === "string" && loadError) {
    return (
      <div className="automation-view-loading" role="alert">
        <span>These steps could not be loaded: {loadError}</span>
        <button className="button" onClick={props.onReloadGraph} type="button">Try again</button>
      </div>
    );
  }
  if (props.taskGraph?.metadata?.summaryOnly === true) {
    return (
      <div aria-busy="true" aria-live="polite" className="automation-view-loading">
        <span aria-hidden className="automation-view-loading-indicator" />
        <span>Opening these steps...</span>
      </div>
    );
  }
  if (!props.taskGraph) {
    return <FlowEditorStartPane flow={props.authoringFlow ?? null} onCreateFlow={props.onCreateFlow} projectId={props.projectId ?? null} />;
  }
  return <HydratedFlowEditorView {...props} />;
});

/**
 * What a person sees the moment a project opens. It asks for the job in plain
 * words while the chosen automation is still empty, and otherwise says in one
 * sentence what to do next. It is never a blank pane.
 */
function FlowEditorStartPane(props: { projectId: string | null; flow: any; onCreateFlow: (() => void) | undefined }) {
  const commands = useRuntimeExecutionCommands();
  const improvementCommands = useFlowImprovementCommands();
  const [readiness, setReadiness] = useState<StartPaneReadiness>(idleReadiness);
  const [revision, setRevision] = useState(0);
  const generationRef = useRef(0);
  const flowId: string = props.flow?.flowId ?? "";
  useEffect(() => {
    const generation = ++generationRef.current;
    if (!props.projectId || !flowId) {
      setReadiness(idleReadiness);
      return;
    }
    setReadiness({ ...idleReadiness, loading: true });
    commands.loadReadiness({ projectId: props.projectId, flowId }).then((result) => {
      if (generationRef.current === generation) setReadiness({ loading: false, ...result });
    }).catch((error: unknown) => {
      // The person is the one who acts on this, so the failure is put on the
      // pane beside a Try again button rather than thrown into an empty view.
      // A newer request supersedes it, which the updater decides, so that the
      // error is always carried and never dropped on the way.
      const reported = error instanceof Error && error.message ? error.message : String(error);
      const message = reported && reported !== "undefined" ? `We could not check this automation: ${reported}` : "We could not reach FluxIQ to check this automation.";
      setReadiness((current) => generationRef.current === generation ? { ...idleReadiness, error: message } : current);
    });
  }, [commands, flowId, props.projectId, revision]);

  const canDescribeTheJob = blankFlowExplorationRequest(props.projectId, props.flow, readiness).ok
    || blankFlowAuthoringRequest(props.projectId, props.flow, readiness).ok;
  // A Flow that already has steps is improved rather than described afresh:
  // the person says what should change, and the result is a suggested change.
  const canImprove = !canDescribeTheJob && existingFlowImprovementRequest(props.projectId, props.flow, readiness).ok;

  return (
    <section aria-label="Start here" className="automation-flow-start-pane">
      <div className="automation-flow-start-intro">
        <Sparkles aria-hidden size={22} />
        <strong>{canDescribeTheJob ? "Tell FluxIQ what to automate" : startPaneHeading(props.projectId, flowId, readiness, props.flow)}</strong>
        <p>{canDescribeTheJob
          ? "Write what you want done on a website, in your own words. FluxIQ opens the page, works out the steps itself, and shows you a draft to check before anything is saved."
          : startPaneBody(props.projectId, flowId, readiness, props.flow)}</p>
        {!canDescribeTheJob && readiness.error
          ? <button className="button button-primary" onClick={() => setRevision((value) => value + 1)} type="button">Try again</button>
          : null}
        {/*
          Nothing is open, so the pane offers the one thing that gets a person
          moving instead of pointing at a control elsewhere on the screen.
        */}
        {!flowId && props.onCreateFlow
          ? <button className="button button-primary" onClick={props.onCreateFlow} type="button">
            <Plus aria-hidden size={15} />Create automation
          </button>
          : null}
      </div>
      {readiness.loading
        ? <div className="automation-view-loading"><span aria-hidden className="automation-view-loading-indicator" /><span>Checking this automation...</span></div>
        : null}
      {canDescribeTheJob
        ? <BlankFlowAuthoringPanel commands={commands} flow={props.flow} projectId={props.projectId} readiness={readiness} />
        : null}
      {canImprove
        ? <ImproveFlowPanel commands={improvementCommands} flow={props.flow} projectId={props.projectId} readiness={readiness} />
        : null}
    </section>
  );
}

function startPaneHeading(projectId: string | null, flowId: string, readiness: StartPaneReadiness, flow: any): string {
  if (!projectId || !flowId) return "Nothing open yet";
  if (readiness.error) return "We could not check this automation";
  if (readiness.loading) return "Opening this automation";
  if (!flow?.metadata?.llmSecretKeyId) return "One setting to go";
  return "This automation already has steps";
}

function startPaneBody(projectId: string | null, flowId: string, readiness: StartPaneReadiness, flow: any): string {
  if (!projectId || !flowId) return "Choose an automation from the list on the left to work on it, or make a new one here.";
  if (readiness.error) return readiness.error;
  if (readiness.loading) return "One moment.";
  if (!flow?.metadata?.llmSecretKeyId) return "Open Settings for this automation and choose the model key it should use. After that you can describe the job here, in your own words.";
  return "Pick one of its parts from the list on the left to see and change the steps inside it.";
}

const HydratedFlowEditorView = memo(function HydratedFlowEditorView(props: FlowEditorProps) {
  const controller = useFlowEditorController(props);
  return (
    <Suspense fallback={<div className="automation-view-loading"><span aria-hidden className="automation-view-loading-indicator" /><span>Opening these steps...</span></div>}>
      <FlowGraphCanvas controller={controller} props={props} />
    </Suspense>
  );
});
