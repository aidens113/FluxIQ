export type AutomationGraphActionOutcome<T> =
  | { status: "success"; value: T }
  | { status: "failure"; error: string }
  | { status: "cancelled" | "stale"; reason: string };

export function shouldRestoreAutomationGraphDraft(stale: boolean, confirmRestore: () => boolean): boolean {
  return !stale || confirmRestore();
}

export function applyAutomationGraphDraftRestore<T extends { draftKey: string; graph: unknown }>(outcome: AutomationGraphActionOutcome<T>, apply: (value: T) => void): { ok: true } | { ok: false; error: string } {
  if (outcome.status !== "success") return { ok: false, error: outcome.status === "failure" ? outcome.error : outcome.reason };
  apply(outcome.value);
  return { ok: true };
}

export async function discardAutomationGraphRecovery(run: () => Promise<AutomationGraphActionOutcome<unknown>>, clear: () => void): Promise<{ ok: true } | { ok: false; error: string }> {
  const outcome = await run();
  if (outcome.status !== "success") return { ok: false, error: outcome.status === "failure" ? outcome.error : outcome.reason };
  clear();
  return { ok: true };
}

export async function reloadSavedAutomationGraph(input: { reload(): Promise<unknown | null>; clearDraft(): void; markClean(): void; notify(): void }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const reloaded = await input.reload();
    if (!reloaded) return { ok: false, error: "The newest saved Flow could not be loaded. Your draft was kept." };
    input.clearDraft();
    input.markClean();
    input.notify();
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "The newest saved Flow could not be loaded. Your draft was kept." };
  }
}
