// What a person can ask the panel to do, said once.
//
// The product owner's requirement is that "a user should be able to fully
// operate the entire control panel using the chat window". Before this file the
// panel and the conversation were two unrelated vocabularies: a control called
// a function in a `*-commands.ts` module, and the conversation could do exactly
// two things -- write a turn, and answer a question Core had already asked. A
// person who typed "run this flow" wrote a row into a transcript and nothing
// happened, because `append-turn` stores text and nobody reads it back as an
// instruction.
//
// A capability is the single declaration of one thing the panel can do. It
// names the control that offers it, the endpoint it reaches, the arguments it
// takes, what it changes that outlasts it, and -- the part that closes the gap
// -- the handler that performs it. The handler is not optional and has no
// default: a capability declared without one does not type-check, which is the
// mechanical form of "a capability cannot be added with a button but no
// conversational path". `tests/coverage.test.ts` carries the other half, that
// no mutating endpoint the panel posts is missing from the catalog altogether.
//
// **The handler is the same code the control runs.** Every `invoke` here calls
// the existing command module -- `startRuntimeSession`, `saveFlowSettings`,
// `applySubflowDirectoryAction` -- rather than posting its own request. A
// parallel vocabulary would drift from the buttons within a week, and the whole
// point is that there is one declaration behind both.

import { AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "fluxiq/automation-studio/action-permissions";
import type { ProgramCommandTransport } from "../../data/program-transport";
import type { AutomationStudioActionConsequence } from "../thread";

/** What a value is, in the terms a person or a model writes it in. */
export type PanelCapabilityArgumentKind = "text" | "id" | "number" | "boolean" | "json";

/**
 * Where a missing argument may be taken from instead of refused.
 *
 * A person asking the chat window to "run it" means the Flow they are looking
 * at. Demanding the id back from someone who can see it on screen is the
 * failure mode this exists to avoid: a capability must be usable with the
 * fewest parameters that can possibly work, and anything derivable is derived.
 */
export type PanelCapabilityContextKey = "projectId" | "flowId" | "subflowId" | "runId" | "recordingId" | "conversationId";

export type PanelCapabilityArgument = {
  name: string;
  kind: PanelCapabilityArgumentKind;
  /** One sentence, written for whoever has to supply the value. */
  describe: string;
  /** Whether the capability cannot run at all without it. */
  required: boolean;
  /** Read from what the panel currently has open when the request leaves it out. */
  fromContext?: PanelCapabilityContextKey;
};

/** The heading a capability is listed under when the model says what it can do. */
export type PanelCapabilityGroup =
  | "Flows"
  | "Running"
  | "Settings"
  | "Permissions"
  | "Versions"
  | "Projects"
  | "Recordings"
  | "Collected data"
  | "Conversation";

/**
 * The panel control that offers the same capability. Declared so the two
 * cannot drift apart silently, and so the model can tell a person where the
 * button is when they would rather press it themselves.
 */
export type PanelCapabilityControl = {
  /** The registered view the control sits in, or `null` for a dialog reachable anywhere. */
  view: string | null;
  /** What the control is called on screen. */
  label: string;
};

/** What the panel currently has open. Every field may be absent. */
export type PanelCapabilityContext = {
  transport: ProgramCommandTransport;
  projectId: string | null;
  flowId?: string | null;
  subflowId?: string | null;
  runId?: string | null;
  recordingId?: string | null;
  conversationId?: string | null;
  /**
   * Supplied only when the person has just re-authorized. Absent is the normal
   * case and is not an error: a capability that needs one answers `asks`.
   */
  authorizationPin?: string | null;
};

/**
 * One supplied value. An object or a list is allowed because some capabilities
 * take a structure -- a route's condition, a settings patch -- and whoever has
 * already built one should not have to re-encode it as a string first.
 */
export type PanelCapabilityArgumentValue =
  | string
  | number
  | boolean
  | null
  | Readonly<Record<string, unknown>>
  | readonly unknown[];

export type PanelCapabilityArguments = Readonly<Record<string, PanelCapabilityArgumentValue>>;

/**
 * What came of running it, in words that can go straight into the transcript.
 *
 * `asks` is not a refusal and is not a general permission gate. It is reserved
 * for the two consequence classes Core still asks a person about -- deleting
 * something and moving money -- and it means the panel needs the person to
 * prove who they are again before it sends. Everything else runs: the person
 * asking for the automation is the grant, and a capability that answered
 * "may I?" for ordinary work would be the defect, not the safeguard.
 */
export type PanelCapabilityOutcome =
  | { status: "done"; summary: string; payload?: unknown }
  | { status: "asks"; summary: string; consequences: readonly AutomationStudioActionConsequence[] }
  | {
    status: "failed";
    summary: string;
    error: string;
    /** The transport said the same request could succeed if sent again. Only reads are retried on it. */
    retryable?: boolean;
  };

export type PanelCapability = {
  /** Stable, dotted, and the name the conversation calls it by: `flow.run`. */
  id: string;
  title: string;
  /** One sentence saying what happens, written for the person asking. */
  summary: string;
  group: PanelCapabilityGroup;
  /** Ways a person might say it. Feeds nearest-match resolution, never an exact-match gate. */
  phrases: readonly string[];
  control: PanelCapabilityControl;
  /**
   * Every Core endpoint this capability can reach. Usually one; several when a
   * capability picks between a family of them, as turning part of a Flow on,
   * off or into the archive does. `tests/coverage.test.ts` matches the panel's
   * own endpoint use against this, so a family with one member declared would
   * leave the others looking uncovered, which they would be.
   */
  endpoints: readonly string[];
  arguments: readonly PanelCapabilityArgument[];
  /** Everything lasting this would cause, in Core's own classes. Empty for a read. */
  consequences: readonly AutomationStudioActionConsequence[];
  /**
   * Perform it. Required, with no default: this is the property that makes a
   * capability with a button and no conversational path a compile error.
   */
  invoke(context: PanelCapabilityContext, args: PanelCapabilityArguments): Promise<PanelCapabilityOutcome>;
};

/**
 * The consequence classes that still stop for the person - Core's own decision,
 * imported rather than restated.
 *
 * `runtime/action-permissions/destructive.ts` decides it, and as of 2026-09-28
 * it is published on the browser-safe
 * `fluxiq/automation-studio/action-permissions` barrel. Until then it was not,
 * so the panel kept its own copy of the two gated classes with a test pinning
 * the copy - which meant Core could narrow or widen its gate and the browser
 * would go on showing the old answer, with every test on both sides green. Two
 * lists of what asks a person is one list too many, so there is one, and it is
 * Core's. `tests/registry.test.ts` still asserts the two classes, and now that
 * assertion reads through to Core.
 */
export const PANEL_CAPABILITY_ASKING_CONSEQUENCES: readonly AutomationStudioActionConsequence[] =
  AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES;

/** Whether performing this needs the person to re-authorize first. */
export function panelCapabilityAsksFirst(capability: PanelCapability): boolean {
  return capability.consequences.some((consequence) => PANEL_CAPABILITY_ASKING_CONSEQUENCES.includes(consequence));
}

/**
 * Declare one capability.
 *
 * It exists to make the type check at the declaration site rather than at the
 * catalog's assignment, so the error names the capability that is missing a
 * handler instead of the array holding it.
 */
export function definePanelCapability(capability: PanelCapability): PanelCapability {
  return Object.freeze(capability);
}

/**
 * A command module's answer, as an outcome the transcript can carry.
 *
 * Every command module returns the same envelope -- `{ ok, payload, error }` --
 * so turning one into an outcome is done once here rather than thirty times in
 * the catalog. A refusal keeps Core's own words: the person asked the panel to
 * do something and is owed the reason it did not, not a sentence the panel
 * invented over the top of it.
 */
export function panelCapabilityResult(
  response: { ok: boolean; payload?: unknown; error?: string; retryable?: boolean },
  done: string,
  failed: string
): PanelCapabilityOutcome {
  if (response.ok) return { status: "done", summary: done, payload: response.payload };
  return { status: "failed", summary: failed, error: response.error ?? failed, ...(response.retryable ? { retryable: true } : {}) };
}
