// The local rehearsal's fake payment provider: a person paying stood in for
// by the provider's own signed checkout completion, decided by the plan, with
// its state kept across restarts as a real provider keeps it.
export { fakeProviderState } from "./fake-provider-state";
export type { FakeProviderState } from "./fake-provider-state";
export { PlanFakePaymentProvider } from "./plan-fake-payment-provider";
