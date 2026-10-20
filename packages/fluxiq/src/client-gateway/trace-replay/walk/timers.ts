// The waits of a replayed gateway (traces and offline trials, P3). None runs
// out on its own: a command's answer wait runs out only when the replay
// reaches the point where the recording shows Core acting on its expiry (a
// reconcile question, an answer-never-came outcome), so an answer that came in
// time in the recording is never beaten by a replay that runs faster or slower.

import type { ClientGatewayTimer, ClientGatewayTimerSource } from "../../service/index.ts";

export class ClientGatewayTraceReplayTimers {
  /** Command id to what its running answer wait does when it runs out. */
  private readonly waits = new Map<string, () => void>();

  /** The gateway's timer source (`ClientGatewayServiceOptions.startTimer`). */
  readonly start: ClientGatewayTimerSource = (wait, _delayMs, fire): ClientGatewayTimer => {
    const commandId = wait.commandId;
    this.waits.set(commandId, fire);
    return {
      cancel: () => {
        if (this.waits.get(commandId) === fire) this.waits.delete(commandId);
      }
    };
  };

  /** Whether command `commandId` has an answer wait running. */
  pending(commandId: string): boolean {
    return this.waits.has(commandId);
  }

  /** Runs out command `commandId`'s answer wait; false when none was running. */
  fire(commandId: string): boolean {
    const fire = this.waits.get(commandId);
    if (fire === undefined) return false;
    this.waits.delete(commandId);
    fire();
    return true;
  }
}
