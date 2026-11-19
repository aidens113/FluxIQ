import { appRouteIamContract } from "../../../../../../lib/app-route-iam";
import { billingStatus, startCheckout, withCommerceRoute } from "../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = appRouteIamContract("GET", "/api/platform/v1/commerce/checkout");
const START = appRouteIamContract("POST", "/api/platform/v1/commerce/checkout");

/** The plans on offer and the workspace's billing: its state, dedicated browsers, seats and open checkout. */
export async function GET(request: Request): Promise<Response> {
  return withCommerceRoute(request, STATUS, (deps) => billingStatus(deps));
}

/** Starts a Checkout of the plan named by `planId` and answers its URL; the account's open checkout is expired first. */
export async function POST(request: Request): Promise<Response> {
  return withCommerceRoute(request, START, async (deps) => startCheckout(deps, await request.text()));
}
