// The mounted chat, as a client holds it.

import type { ClientGatewayActivity } from "fluxiq/ui";
import type { ChatHostStatus } from "../ports/index.ts";
import type { ChatTarget } from "../target.ts";

/** The mounted chat. */
export type ChatWidget = {
  readonly element: HTMLElement;
  /** Tells it what the host knows of its connection; a different `ownerKey` makes it forget the last owner's chat. */
  render(status: ChatHostStatus): void;
  /** Starts or stops reading the thread and the activity; starting reads both at once. */
  setActive(active: boolean): void;
  /** Puts the caret in the composer. */
  focusComposer(): void;
  /** Attaches the project's newest finished, described recording to the next message; answers whether there was one. */
  attachLatestRecording(): Promise<boolean>;
  /** Shows `target`'s thread; what the person sends from then on goes there. */
  open(target: ChatTarget): void;
  /** Updates only the current automation's name, preserving the reading position. */
  updateAutomationName(automation: { readonly flowId: string; readonly name: string }): void;
  /** The thread shown now. */
  target(): ChatTarget;
  /** Hears every change of target, including the person's own "Latest chat". Answers an unsubscribe. */
  onTargetChange(listener: (target: ChatTarget) => void): () => void;
  /**
   * Shows `run`'s steps live: when the thread on screen would not show them,
   * opens one that does (`stream/run-target.ts`), waiting while the person
   * types in the composer and never during a recording.
   */
  followRun(run: ClientGatewayActivity): void;
  /**
   * True while the chat is out of sight (a collapsed window): only the thread
   * list keeps reading, on a slow beat, so a badge can light. False reads
   * everything at once and follows the tail.
   */
  setBackground(on: boolean): void;
  /** Reads the thread on screen from its start, so every turn shows (`options.history`). */
  showEarlier(): void;
};
