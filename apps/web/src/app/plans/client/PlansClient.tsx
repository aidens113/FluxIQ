"use client";

import { useEffect, useState } from "react";
import { describePlan } from "./describe-plan";
import { readBillingStatus } from "./read-billing-status";
import { startPlanCheckout } from "./start-plan-checkout";
import type { BillingStatusAnswer } from "./types";

/** What the return from Checkout says, read once from the address and then cleared from it. */
function useCheckoutReturn(): "success" | "cancel" | null {
  const [returned, setReturned] = useState<"success" | "cancel" | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get("checkout");
    if (value === "success" || value === "cancel") setReturned(value);
    if (value !== null) {
      url.searchParams.delete("checkout");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);
  return returned;
}

const STATE_SENTENCE: Readonly<Record<string, string>> = {
  none: "No plan yet.",
  "checkout-pending": "A checkout is open and waiting for payment.",
  active: "Your plan is active.",
  "past-due": "Your last payment did not go through; your plan keeps working for now.",
  suspended: "Your plan is suspended until the payment goes through.",
  "cancel-at-period-end": "Your plan ends at the end of this period.",
  ended: "Your plan has ended.",
  restricted: "Your plan is on hold."
};

/**
 * Lists the configured plans and the workspace's billing, and sends the
 * person to Checkout for the plan they choose. After paying they land back
 * here: the payment is confirmed by the provider's signed webhook, not by
 * the return, so the page reads the billing again and says when it is active.
 */
export function PlansClient() {
  const returned = useCheckoutReturn();
  const [status, setStatus] = useState<BillingStatusAnswer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void readBillingStatus().then((answer) => { if (live) setStatus(answer); });
    return () => { live = false; };
  }, [returned]);

  async function choose(planId: string) {
    setBusy(planId);
    setFailure(null);
    const answer = await startPlanCheckout(planId);
    if (answer.ok) {
      window.location.assign(answer.url);
      return;
    }
    setBusy(null);
    setFailure(answer.error);
  }

  if (status === null) return <p role="status">Reading your plan...</p>;
  if (!status.ok) {
    if (status.status === 401) return <p role="alert">Sign in to choose a plan. <a href="/">Sign in</a></p>;
    return <p role="alert">{status.error}</p>;
  }
  const account = status.account;
  return <>
    {returned === "success" ? <p role="status">Thank you. Your payment is being confirmed; this page shows your plan as active once it is.</p> : null}
    {returned === "cancel" ? <p role="status">The checkout was cancelled; nothing was charged.</p> : null}
    {account === null
      ? <p role="alert">This workspace has no billing account of its own, so it cannot choose a plan here.</p>
      : <p>{STATE_SENTENCE[account.state] ?? `Plan state: ${account.state}.`} {account.dedicatedEnvironments > 0 ? `Dedicated browsers: ${account.dedicatedEnvironments}.` : ""}{account.seats > 0 ? ` Seats: ${account.seats}.` : ""}</p>}
    <ul className="plans-list">
      {status.plans.map((plan) => <li className="plans-option" key={plan.id}>
        <div><strong>{plan.name}</strong><p>{describePlan(plan)}</p></div>
        <button disabled={account === null || busy !== null} onClick={() => void choose(plan.id)} type="button">{busy === plan.id ? "Opening checkout..." : "Choose"}</button>
      </li>)}
    </ul>
    {failure ? <p role="alert">{failure}</p> : null}
  </>;
}
