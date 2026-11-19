// The shape of Core's model-access state (`ModelAccessState` in `@fluxiq/contracts/platform`, read there with
// `readModelAccessState`). Restated structurally so this package needs no contracts dependency: a value the
// contract reader returned is assignable to it as it stands.

/** Core's model-access state, as each client reads it from the panel snapshot or the extension's relay. */
export type CoreModelAccess = {
  status: "ready" | "no_key" | "key_unopenable" | "not_permitted" | "provider_refused" | "provider_unreachable" | "no_credit";
  message: string;
  key: { id?: string; name: string; provider: string; model: string } | null;
  lastCall: { outcome: "answered" | "provider_refused" | "no_credit" | "provider_unreachable"; atMs: number } | null;
  unopenableCode?: string;
};
