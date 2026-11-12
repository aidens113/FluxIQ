import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import { declaredDomainId } from "../declared-domain.ts";
import type { ClientGatewayManagedHostRun } from "./types.ts";

/** Run authority is process-local and lives exactly as long as its lease. */
export class ClientGatewayManagedHostRuns {
  private readonly bindings = new Map<string, ClientGatewayManagedHostRun & { isCurrent(): boolean }>();

  constructor(private readonly sessions: ClientGatewaySessionRegistry, private readonly trusted: (trustedClientId: string) => boolean) {}

  bind(input: ClientGatewayManagedHostRun & { isCurrent(): boolean }): () => void {
    if (!this.valid(input) || this.bindings.has(input.sessionId)) throw new Error("managed_host.invalid_run_binding: A current, unbound managed session and lease are required.");
    const binding = Object.freeze({ ...input, lease: Object.freeze({ ...input.lease, holder: Object.freeze({ ...input.lease.holder }) }) });
    this.bindings.set(input.sessionId, binding);
    const session = this.sessions.requireReady(input.sessionId);
    session.projectId = input.projectId;
    return () => {
      if (this.bindings.get(input.sessionId) !== binding) return;
      this.bindings.delete(input.sessionId);
      delete session.projectId;
    };
  }

  current(sessionId: string): ClientGatewayManagedHostRun | undefined {
    const binding = this.bindings.get(sessionId);
    if (binding === undefined || !this.valid(binding)) return undefined;
    const { isCurrent: _isCurrent, ...view } = binding;
    return view;
  }

  private valid(binding: ClientGatewayManagedHostRun & { isCurrent(): boolean }): boolean {
    const session = this.sessions.get(binding.sessionId);
    return Boolean(session?.managedHostId && session.trustedClientId && this.trusted(session.trustedClientId) && session.status === "ready" && session.disconnectedAt === undefined
      && declaredDomainId(session.metadata) === binding.domainId && binding.projectId.trim() && binding.runId.trim()
      && binding.lease.sessionId === binding.sessionId && binding.isCurrent());
  }
}
