import type { AutomationStudioFlowArtifact } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowDocument } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../index.ts";
import type { AutomationStudioLifecycleRunState } from "../lifecycle-run/index.ts";
import type { AutomationStudioInvocationFrame } from "./invocation-frame.ts";
import type { AutomationStudioPartPin } from "./part-pin.ts";

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
  /**
   * The saved versions this run is trying in place of an older pin that failed, by the id
   * their frames run under, each with the incident its fix is held under (`./newer-part.ts`).
   * While one is tried no model is asked inside it. Its failure carries an incident of its
   * own up from its frame, so this is what says that failure is the trial's.
   */
  newerPartTrials: Map<string, string>;
};

/**
 * The frame one graph run executes as. Absent on a run nobody framed, which
 * then frames itself as the root.
 */
export type AutomationStudioInvocationOptions = {
  run: AutomationStudioRunFrames;
  frame: AutomationStudioInvocationFrame;
};

/** A sibling Subflow graph of the run's automation at the revision the run executes, or a saved part at the version a step pins (`./part-pin.ts`). */
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
  /** On a saved part's version only: what this run may try in its place when it fails (`./newer-part.ts`). */
  newerParts?: AutomationStudioNewerPartVersions;
};

/**
 * What the library says about the versions newer than one a run pinned, for one run. Made
 * for each run, because what it has already tried is the run's. It fails closed: a read it
 * cannot make offers nothing, and an act it cannot tell about may have landed.
 */
export type AutomationStudioNewerPartVersions = {
  /** The versions a run may still try in this one's place, newest first: the same interface, not refuted, able to run, not tried in this run. */
  candidates(): Promise<readonly AutomationStudioPartPin[]>;
  /** Whether these attempts of the version may have done something lasting, so that running a version from its start could do it again. */
  mayHaveLanded(attempts: readonly AutomationStudioNodeAttemptTrace[], options: AutomationStudioGraphExecutionOptions): Promise<boolean>;
  /** A version is about to be tried: a run tries each once. */
  taken(pin: AutomationStudioPartPin, runId: string): void;
  /** A version tried here failed: said of that version alone. Answers whether it may have done something lasting, after which nothing is run from its start again. */
  failed(pin: AutomationStudioPartPin, attempts: readonly AutomationStudioNodeAttemptTrace[], options: AutomationStudioGraphExecutionOptions): Promise<boolean>;
};

/** Why a pinned part is not run though its version may be there: its calls go round in a circle, or too deep. The code is stable. */
export type AutomationStudioPartPinRefusal = { code: string; message: string };

/**
 * Where a run finds the sibling Subflow graphs of its own automation: the
 * graphs a Call Subflow node may call, and the automation's `recovery`-role
 * Subflow graph, which holds automation-scope handlers (C4). Supplied by the
 * run session; a run without one cannot call a Subflow.
 *
 * `load` answers a pinned part's id as well (`./part-pin.ts`), when the source reaches
 * the project's library; a source that does not answers nothing for it, and the call
 * then fails with a closed code. `pinRefusal` is asked before a pinned part's frame starts.
 */
export type AutomationStudioSubflowGraphSource = {
  load(subflowId: string): Promise<AutomationStudioSubflowGraph | undefined>;
  recovery?(): Promise<AutomationStudioSubflowGraph | undefined>;
  pinRefusal?(pin: AutomationStudioPartPin): Promise<AutomationStudioPartPinRefusal | undefined>;
};
