import type { IdentityFirstRun, IdentityFirstRunState, User } from "../../types.ts";
import { readFirstRunState } from "./read-first-run-state.ts";
import { seedTemporaryAdmin } from "./seed-temporary-admin.ts";

/** What the control needs from its identity service: the accounts it holds, its load, and two credential operations that mint no session. */
export type IdentityFirstRunHost = {
  users: Map<string, User>;
  /** Loads the store (single-flight); `loaded` is true once a load has begun. */
  ready(): Promise<void>;
  loaded(): boolean;
  /** Proves a password for an account without a session; throws the invalid-credentials refusal when wrong. */
  prove(userId: string, password: string): Promise<unknown>;
  setPassword(userId: string, password: string): Promise<unknown>;
};

/**
 * `IdentityAccessService.firstRun`: what an empty store starts with
 * (`IdentityFirstRun`), and which first-run state a store is in.
 */
export class IdentityFirstRunControl {
  private mode: IdentityFirstRun = "temporary-admin";

  constructor(private readonly host: IdentityFirstRunHost) {}

  /** Before the first load: an empty store starts with no account, for a first-run setup to create the owner. False once loaded, so a store is never emptied. */
  startUnclaimed(): boolean {
    if (this.host.loaded()) return false;
    this.mode = "unclaimed";
    return true;
  }

  /** The store's first-run state (`readFirstRunState`); proving the temporary password mints no session. */
  async state(): Promise<IdentityFirstRunState> {
    await this.host.ready();
    return readFirstRunState(this.host.users, (userId, password) => this.host.prove(userId, password));
  }

  /** For the service's load: an empty store gets the default admin on its temporary password, unless it starts unclaimed. */
  async seed(): Promise<boolean> {
    return this.mode === "temporary-admin" && await seedTemporaryAdmin(this.host.users, this.host.setPassword);
  }
}
