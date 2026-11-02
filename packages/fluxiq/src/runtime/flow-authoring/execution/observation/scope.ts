import type { AuthoringExecutionContext } from "./context.ts";
import { authoringExecutionScopes } from "./internal/index.ts";

/** One original internal invocation forwards an already admitted parent. */
export class AuthoringExecutionScope {
  private static readonly owners = new WeakMap<object, object>();
  constructor(readonly invocation: object, readonly context: AuthoringExecutionContext, readonly options: object = invocation, private readonly previous?: AuthoringExecutionScope) {
    if (authoringExecutionScopes.get(invocation) !== previous) throw new Error("site_reset.observation_rebound");
    authoringExecutionScopes.set(invocation, this);
  }

  static of(invocation: object | undefined): AuthoringExecutionScope | undefined {
    return invocation ? authoringExecutionScopes.get(invocation) : undefined;
  }

  /** A Core factory links its actual returned data port to its original owning instance. */
  static own(port: object, owner: object): void {
    const prior = this.owners.get(port);
    if (prior && prior !== owner) throw new Error("site_reset.owner_changed");
    for (let current: object | undefined = owner; current; current = this.owners.get(current)) if (current === port) throw new Error("site_reset.owner_cycle");
    this.owners.set(port, owner);
  }

  static targets(receiver: unknown, argument?: object): object[] {
    const targets = new Set<object>(argument ? [argument] : []);
    if (receiver !== null && (typeof receiver === "object" || typeof receiver === "function")) for (let current: object | undefined = receiver; current; current = this.owners.get(current)) targets.add(current);
    return [...targets];
  }

  close(): void {
    if (authoringExecutionScopes.get(this.invocation) !== this) throw new Error("site_reset.observation_changed");
    if (this.previous) authoringExecutionScopes.set(this.invocation, this.previous);
    else authoringExecutionScopes.delete(this.invocation);
  }
}
