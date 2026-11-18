/** One plan as the billing status offers it: its id, name and what each line counts. */
export type PlanOffer = { id: string; name: string; lines: { unit: "dedicated-browser" | "seat" | "flat"; quantity: number }[] };

/** The paying account's billing, as the status route answers it. */
export type PlanAccount = {
  state: string;
  dedicatedEnvironments: number;
  seats: number;
  graceEndsAt?: number;
  openCheckout: { planId: string; expiresAtMs: number } | null;
};

/** The billing status route's answer. */
export type BillingStatusAnswer =
  | { ok: true; plans: PlanOffer[]; account: PlanAccount | null }
  | { ok: false; status: number; error: string };
