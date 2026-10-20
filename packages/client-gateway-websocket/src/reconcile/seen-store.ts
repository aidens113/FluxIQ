// The command ids a client has received, kept in the same storage area as the
// in-flight records (Core C8), so a restarted client still knows a command
// reached it after the command's record was cleared.
//
// It is what keeps the answer to Core's "what became of command X?" honest: a
// client that lost the result it sent must answer `unknown`, never `not_seen`,
// because `not_seen` lets Core make the act again. Only ids and times are kept,
// one key per id (`<keyPrefix><commandId>`), the newest `SEEN_LIMIT`.

import type { ClientGatewayStorageArea } from "../storage-area/index.ts";

/** How many received command ids are remembered, newest kept. */
const SEEN_LIMIT = 64;

export type ClientGatewaySeenCommandStoreOptions = {
  /** The prefix each id's key is stored under (default `fluxiq.commandSeen.`). */
  readonly keyPrefix?: string;
};

export class ClientGatewaySeenCommandStore {
  private readonly keyPrefix: string;

  constructor(private readonly area: ClientGatewayStorageArea, options: ClientGatewaySeenCommandStoreOptions = {}) {
    this.keyPrefix = options.keyPrefix ?? "fluxiq.commandSeen.";
  }

  /** Remembers that a command reached this client, and forgets the oldest past the limit. */
  async mark(commandId: string, at: number): Promise<void> {
    await this.area.set({ [this.keyPrefix + commandId]: at });
    const seen = Object.entries(await this.area.get(null))
      .filter((entry): entry is [string, number] => entry[0].startsWith(this.keyPrefix) && typeof entry[1] === "number")
      .sort((left, right) => right[1] - left[1]);
    for (const [key] of seen.slice(SEEN_LIMIT)) await this.area.remove(key);
  }

  async has(commandId: string): Promise<boolean> {
    return typeof (await this.area.get(null))[this.keyPrefix + commandId] === "number";
  }
}
