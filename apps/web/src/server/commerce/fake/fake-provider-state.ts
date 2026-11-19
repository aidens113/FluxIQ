import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ProviderSubscriptionState } from "fluxiq/platform";

/** What the fake provider keeps, as a real provider keeps it outside FluxIQ: its checkouts and its subscriptions. */
export type FakeProviderState = {
  checkouts: Record<string, { planId: string; accountId: string; customerId: string | null; status: "open" | "completed" | "expired" }>;
  subscriptions: Record<string, ProviderSubscriptionState>;
};

/**
 * The fake provider's durable state in one JSON file: read once when the
 * provider is built (null when there is none yet), and replaced whole on each
 * change, written beside itself and renamed, so a crash never leaves half a
 * file. It holds synthetic test accounts' plans only, never a secret.
 */
export function fakeProviderState(file: string): { load(): FakeProviderState | null; save(state: FakeProviderState): void } {
  return {
    load: () => {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const value = JSON.parse(text) as Partial<FakeProviderState>;
      if (value === null || typeof value !== "object" || typeof value.checkouts !== "object" || typeof value.subscriptions !== "object") {
        throw new Error(`commerce.fake_state_invalid: ${path.basename(file)} is not the fake provider's state.`);
      }
      return { checkouts: value.checkouts ?? {}, subscriptions: value.subscriptions ?? {} };
    },
    save: (state) => {
      mkdirSync(path.dirname(file), { recursive: true });
      const next = `${file}.next`;
      writeFileSync(next, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      renameSync(next, file);
    }
  };
}
