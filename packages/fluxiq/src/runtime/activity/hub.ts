import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioWithoutRunSecrets } from "../run-secrets/index.ts";
import { boundedAutomationStudioActivity } from "./bounded.ts";
import type { AutomationStudioActivityInput, AutomationStudioActivityListener, AutomationStudioActivitySnapshot } from "./contracts.ts";
import { AUTOMATION_STUDIO_ACTIVITY_LIMITS } from "./limits.ts";

/**
 * The process's activity stream: numbers and stamps each event, bounds it,
 * keeps the last few per project, and hands it to every subscriber.
 *
 * Activity is ephemeral (D2): nothing here is persisted, and a subscriber that
 * throws loses its own copy of the event, never the work that emitted it.
 */
export class AutomationStudioActivityHub {
  private sequence = 0;
  private readonly listeners = new Set<AutomationStudioActivityListener>();
  private readonly byProject = new Map<string, ClientGatewayActivity[]>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  /**
   * The one place every event passes before it is stored or handed to a subscriber (`emit.ts` is its only
   * caller), so the current run's secrets (`../run-secrets/`) are withheld from every string of it here,
   * before the bound can cut one in half. The emit runs inside the run's async context, through awaits,
   * callbacks and timers; with no secrets in context the input is untouched.
   */
  publish(input: AutomationStudioActivityInput): ClientGatewayActivity {
    this.sequence += 1;
    const event: ClientGatewayActivity = { ...boundedAutomationStudioActivity(automationStudioWithoutRunSecrets(input)), sequence: this.sequence, at: this.now().toISOString() };
    const recent = this.byProject.get(event.subject.projectId) ?? [];
    recent.push(event);
    if (recent.length > AUTOMATION_STUDIO_ACTIVITY_LIMITS.recent) recent.splice(0, recent.length - AUTOMATION_STUDIO_ACTIVITY_LIMITS.recent);
    this.byProject.set(event.subject.projectId, recent);
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch { /* best-effort: a failing subscriber loses its own copy, never the emitting work */ }
    }
    return event;
  }

  /**
   * Adds a subscriber; the returned function removes it. A subscriber left
   * behind keeps its owner reachable from this process-wide hub, so an owner
   * that closes removes it (a FluxIQ instance's runtime does, t808).
   */
  subscribe(listener: AutomationStudioActivityListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** How many subscribers are attached; the instance leak test checks that a closed runtime left none. */
  subscriberCount(): number {
    return this.listeners.size;
  }

  snapshot(projectId: string): AutomationStudioActivitySnapshot {
    const recent = this.byProject.get(projectId) ?? [];
    return { current: recent.at(-1) ?? null, recent: [...recent] };
  }
}
