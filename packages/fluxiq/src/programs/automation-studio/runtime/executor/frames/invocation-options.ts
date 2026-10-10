import type { AutomationStudioFlowArtifact, AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import type { AutomationStudioLifecycleRunState } from "../lifecycle-run/index.ts";
import type { AutomationStudioInvocationFrame } from "./invocation-frame.ts";

/**
 * How a run executes a called Subflow graph as a frame of its own. It is handed
 * the target, the child's options (its frame already set in `invocation`, its
 * inputs already bound), and a callback for the trace as executed beside the
 * saved trace it returns, as `runAutomationStudioGraph` takes one.
 *
 * The canonical execution owner supplies one that compiles the child's regions
 * and runs its Call Flow nodes as the root's are run; a bare graph run supplies
 * one that runs the graph as it stands.
 */
export type AutomationStudioSubflowGraphRunner = (
  target: AutomationStudioSubflowGraph,
  options: AutomationStudioGraphExecutionOptions,
  onExecutedTrace: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
) => Promise<AutomationStudioGraphExecutionTrace>;

/**
 * What every frame of one run shares by reference (state-aware recovery plan,
 * C1, C7). The root graph run creates it; each child frame -- a Call Subflow
 * child, a Call Flow child, and later a handler body -- receives the same
 * object, so the stack and everything run-level that hangs off it is one
 * structure for the whole run and is never reset by entering or leaving a
 * Subflow.
 */
export type AutomationStudioRunFrames = {
  /** The active frames, outermost first. A frame is pushed when it starts and popped when it ends. */
  stack: AutomationStudioInvocationFrame[];
  /** The next invocation id of this run; ids are unique within the run. */
  nextInvocationId(): string;
  /**
   * How this run executes a called Subflow graph, and a handler body in a
   * frame of its own (`../lifecycle-run/`). A holder without one cannot run a
   * Call Subflow node or a handler body.
   */
  runSubflow?: AutomationStudioSubflowGraphRunner;
  /**
   * The run's lifecycle dispatch state (C4, C7): the registration cache, the
   * recovery budget and its ledger, and the open incidents. One per run, made
   * with the holder and never replaced, so no frame resets what another spent.
   */
  lifecycle: AutomationStudioLifecycleRunState;
  /**
   * The graph a called Subflow runs in this run instead of the one its source
   * loads, by Subflow id: an in-run repair whose fix replaced that part (C6
   * step 8). Set only while the repair holds; never persisted.
   */
  subflowOverrides: Map<string, AutomationStudioFlowDocument>;
};

/**
 * The frame one graph run executes as. Absent on a run nobody framed, which
 * then frames itself as the root.
 */
export type AutomationStudioInvocationOptions = {
  run: AutomationStudioRunFrames;
  frame: AutomationStudioInvocationFrame;
};

/** A sibling Subflow graph of the run's automation, at the revision the run executes. */
export type AutomationStudioSubflowGraph = {
  subflowId: string;
  graph: AutomationStudioFlowDocument;
  graphRevision: number | null;
  /**
   * The persisted graph Flow `graph` was read from, when the source read one:
   * its interface and declared errors are the Subflow's contract (C2), and its
   * regions and own timeout govern the child as they govern a selected Subflow.
   * Absent, the Subflow declares nothing, and only what a Call Subflow node binds
   * crosses its boundary.
   */
  artifact?: AutomationStudioFlowArtifact;
};

/**
 * Where a run finds the sibling Subflow graphs of its own automation: the
 * graphs a Call Subflow node may call, and the automation's `recovery`-role
 * Subflow graph, which holds automation-scope handlers (C4). Supplied by the
 * run session; a run without one cannot call a Subflow.
 */
export type AutomationStudioSubflowGraphSource = {
  load(subflowId: string): Promise<AutomationStudioSubflowGraph | undefined>;
  recovery?(): Promise<AutomationStudioSubflowGraph | undefined>;
};
