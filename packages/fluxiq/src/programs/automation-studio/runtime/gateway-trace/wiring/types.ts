// Types of the client gateway trace wiring (traces and offline trials, P2):
// what a build's and a run's episode read for their manifest context, who a
// trial is, and what the host that builds the runtime wires.

import type { ClientGatewayService, ClientGatewayTraceCaptureSource, ClientGatewayTraceStore } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioProjectContentProtection } from "../../../storage/index.ts";
import type { AutomationStudioConversations } from "../../conversations/index.ts";
import type { AutomationStudioRunEnvironment } from "../../environment/index.ts";
import type { AutomationStudioPrepareCandidateStart } from "../../service/candidate-trial/index.ts";
import type { AutomationStudioOfflineTrialGateway } from "../../service/offline-trial/index.ts";
import type { AutomationStudioGatewayTraceEpisodes } from "../episodes.ts";
import type { AutomationStudioGatewayTraceEpisode } from "../types.ts";

/**
 * Reads the protection the service's content stores use now (the host's
 * project content protection); nothing while none is configured.
 */
export type AutomationStudioGatewayTraceProtectionSource = () => AutomationStudioProjectContentProtection | undefined;

/** The conversation reads an episode's context takes: the service's `conversations`. */
export type AutomationStudioGatewayTraceConversationReader = Pick<AutomationStudioConversations, "available" | "getConversation">;

/** The chat thread an episode was started from and the person's turn that started it. */
export type AutomationStudioGatewayTraceConversationContext = {
  conversationId: string;
  turn: { turnId: string; ordinal: number; createdAt: number; text: string } | null;
  /** Why the turn is missing when the thread could not be read; null when it was read. */
  unavailable: string | null;
};

/** What a build's episode reads for its manifest context: the Flow's stored instructions and the chat thread. */
export type AutomationStudioGatewayTraceBuildSources = {
  instructions: () => Promise<readonly AutomationStudioFlowInstruction[]>;
  conversations?: AutomationStudioGatewayTraceConversationReader;
};

/** What a run's episode reads for its manifest context: the run's own input and the chat thread. */
export type AutomationStudioGatewayTraceRunSources = {
  inputs: unknown;
  conversations?: AutomationStudioGatewayTraceConversationReader;
};

/** What the host that builds the runtime wires (D11): nothing at all when tracing is off. */
export type AutomationStudioGatewayTraceHost = {
  /** The installed episodes; undefined when off. */
  episodes: AutomationStudioGatewayTraceEpisodes | undefined;
  /** What the client gateway is handed as `trace`; undefined when off, so nothing is passed. */
  source: ClientGatewayTraceCaptureSource | undefined;
  /** The candidate start hook, recording its answer into the ambient episode when on; unchanged when off. */
  startHook(hook: AutomationStudioPrepareCandidateStart | undefined): AutomationStudioPrepareCandidateStart | undefined;
  /** A project's trace store, the one these episodes write through; undefined when off. */
  storeFor: ((projectId: string) => ClientGatewayTraceStore) | undefined;
  /**
   * Installs offline-first trials in builds (trace plan P6, D44) over
   * `gateway`, this host's trace stores and the project's live session view,
   * in place of any earlier installation; `uninstall` removes them with the
   * episodes. Nothing when off.
   */
  installOfflineTrials(gateway: AutomationStudioGatewayTraceOfflineTrialGateway): void;
  /** Removes exactly these episodes' installation, and the offline-first trials it installed (a host shutting down, a test); nothing when off. */
  uninstall(): void;
};

/** The session reads the live session's public view is chosen from (`./offline-trial-session-view.ts`). */
export type AutomationStudioGatewayTraceSessionGateway = Pick<ClientGatewayService, "snapshot" | "isScopedSession">;

/** The client gateway offline-first trials run over: the matcher session's port and the live session reads. */
export type AutomationStudioGatewayTraceOfflineTrialGateway = AutomationStudioOfflineTrialGateway & AutomationStudioGatewayTraceSessionGateway;

/** Who the trial is: its project and Flow, the run id prefix and minting ports the runner would use, and its manifest context once its id is known. */
export type AutomationStudioGatewayTraceTrial = {
  projectId: string;
  flowId: string;
  prefix: string;
  newRunId?: (() => string) | undefined;
  environment?: AutomationStudioRunEnvironment | undefined;
  context: (runId: string) => AutomationStudioGatewayTraceEpisode["context"];
};
