// What one run's in-run repairs leave behind (state-aware recovery plan, C6
// step 8): which incidents were asked about, a receipt for each fix overlaid
// and each incident that got none, the graph each fix left its frame running,
// and the part graphs a fix replaced, so a later repair of the same part
// builds on the graph the run is running.
//
// It lives for one run session and is read four ways: the receipts, and what
// each in-run recovery recorded (its interventions, gate and trace), join the
// run detail (`../runtime-adaptation/context.ts`), the judged end settles the
// adaptations they name (`../runtime-adaptation/judged-promotion.ts`), the
// detached recovery asks `attempted` so an incident the run already asked a
// model about is never asked about again (`../../recovery/annotation/annotate.ts`),
// and the run's verification is handed the graph its kept fixes left it
// running (`./held-repair-verification.ts`).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioInRunRepairLedgerView } from "../runtime-adaptation/index.ts";

/** One run's in-run repairs. */
export class AutomationStudioInRunRepairLedger implements AutomationStudioInRunRepairLedgerView {
  private readonly asked = new Map<string, { nodeId: string; framePath: readonly string[] }>();
  private readonly entries: JsonObject[] = [];
  private readonly parts = new Map<string, AutomationStudioFlowDocument>();
  private readonly overlaid: ReturnType<AutomationStudioInRunRepairLedgerView["overlays"]> = [];
  private readonly records: ReturnType<AutomationStudioInRunRepairLedgerView["recoveries"]> = [];
  private thrown: { error: unknown } | undefined;

  /** Records that the run asked about this incident; false when it already had, which the executor never lets happen. */
  ask(incidentId: string, at: { nodeId: string; framePath: readonly string[] }): boolean {
    if (this.asked.has(incidentId)) return false;
    this.asked.set(incidentId, { nodeId: at.nodeId, framePath: [...at.framePath] });
    return true;
  }

  record(receipt: JsonObject): void {
    this.entries.push(structuredClone(receipt));
  }

  receipts(): JsonObject[] {
    return this.entries.map((receipt) => structuredClone(receipt));
  }

  attempted(failedAttempt: { nodeId: string; framePath?: readonly string[] | undefined }): boolean {
    for (const at of this.asked.values()) {
      if (at.nodeId !== failedAttempt.nodeId) continue;
      if (!failedAttempt.framePath?.length || !at.framePath.length) return true;
      if (at.framePath.length === failedAttempt.framePath.length && at.framePath.every((id, index) => id === failedAttempt.framePath![index])) return true;
    }
    return false;
  }

  /** Keeps what one in-run recovery left for the run detail. */
  recordRecovery(record: ReturnType<AutomationStudioInRunRepairLedgerView["recoveries"]>[number]): void {
    this.records.push(structuredClone(record));
  }

  recoveries(): ReturnType<AutomationStudioInRunRepairLedgerView["recoveries"]> {
    return this.records.map((record) => structuredClone(record));
  }

  /** Keeps the first fault an in-run recovery threw. */
  recordFault(error: unknown): void {
    this.thrown ??= { error };
  }

  fault(): unknown {
    return this.thrown?.error;
  }

  /** Keeps the graph a fix left its frame running, which a verification of the run reads when the run kept the fix. */
  keepOverlay(overlay: ReturnType<AutomationStudioInRunRepairLedgerView["overlays"]>[number]): void {
    this.overlaid.push(structuredClone(overlay));
  }

  overlays(): ReturnType<AutomationStudioInRunRepairLedgerView["overlays"]> {
    return this.overlaid.map((overlay) => ({ ...overlay, framePath: [...overlay.framePath] }));
  }

  /** The graph this run now runs for a part, when a fix of this run replaced it. */
  partGraph(subflowId: string): AutomationStudioFlowDocument | undefined {
    return this.parts.get(subflowId);
  }

  keepPartGraph(subflowId: string, graph: AutomationStudioFlowDocument): void {
    this.parts.set(subflowId, graph);
  }
}
