// The ids and the clock a replayed gateway runs on (traces and offline trials,
// P3), fed from the recording one step at a time. A step is armed with the
// recorded messages it is expected to send: each server message id Core mints
// is the next recorded one, and minting it moves the clock to that message's
// recorded time (the transport mints a message's id before it reads the
// clock). Command ids and ping nonces come from the command being re-issued.
// When the recording has nothing left for a step, ids are minted fresh and
// visibly (`replay-<kind>-<n>`), so a mismatch shows rather than hides.

import type { ClientGatewayIdKind } from "../../service/index.ts";

/** A message the recording shows a step sent: its id, and its time stamp when it carried one. */
export type ClientGatewayTraceReplayMessageStamp = { readonly id: string; readonly timestamp: number | null };

/** What one replay step is fed. */
export type ClientGatewayTraceReplayStep = {
  /** What the clock reads when the step begins. */
  atMs: number;
  messages: readonly ClientGatewayTraceReplayMessageStamp[];
  commandIds: readonly string[];
  nonces: readonly string[];
};

export class ClientGatewayTraceReplaySources {
  private clock: number;
  private messages: ClientGatewayTraceReplayMessageStamp[] = [];
  private commandIds: string[] = [];
  private nonces: string[] = [];
  private minted = 0;

  constructor(startMs: number) {
    this.clock = startMs;
  }

  /** The gateway's clock (`ClientGatewayServiceOptions.now`). */
  readonly now = (): number => this.clock;

  /** The gateway's id source (`ClientGatewayServiceOptions.createId`). */
  readonly createId = (kind: ClientGatewayIdKind): string => {
    const recorded = this.take(kind);
    if (recorded !== undefined) return recorded;
    this.minted += 1;
    return `replay-${kind}-${this.minted}`;
  };

  /** Starts a step: whatever the previous step left unused is dropped. */
  arm(step: ClientGatewayTraceReplayStep): void {
    this.clock = step.atMs;
    this.messages = [...step.messages];
    this.commandIds = [...step.commandIds];
    this.nonces = [...step.nonces];
  }

  private take(kind: ClientGatewayIdKind): string | undefined {
    if (kind === "command") return this.commandIds.shift();
    if (kind === "nonce") return this.nonces.shift();
    if (kind !== "message") return undefined;
    const message = this.messages.shift();
    if (message === undefined) return undefined;
    if (message.timestamp !== null) this.clock = message.timestamp;
    return message.id;
  }
}
