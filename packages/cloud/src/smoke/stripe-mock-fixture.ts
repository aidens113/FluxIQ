/**
 * The subscription stripe-mock answers every retrieve with (its fixture,
 * stripe/stripe-mock v0.205.0). The smoke names it in its signed events so
 * the payments API answers for the subscription the event names, whether or
 * not stripe-mock echoes a requested id (v0.205.0 does). Its metadata names
 * no FluxIQ account, and it is set to cancel at the end of its item's
 * period, which ended in 2000: billing reports it `ended`.
 */
export const STRIPE_MOCK_SUBSCRIPTION = "sub_1Pgc6rB7WZ01zgkWNy0Cn5nw";
