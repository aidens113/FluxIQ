import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
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

  publish(input: AutomationStudioActivityInput): ClientGatewayActivity {
    this.sequence += 1;
    const event: ClientGatewayActivity = { ...boundedAutomationStudioActivity(input), sequence: this.sequence, at: this.now().toISOString() };
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

  subscribe(listener: AutomationStudioActivityListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  snapshot(projectId: string): AutomationStudioActivitySnapshot {
    const recent = this.byProject.get(projectId) ?? [];
    return { current: recent.at(-1) ?? null, recent: [...recent] };
  }
}
