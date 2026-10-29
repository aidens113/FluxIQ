import type { PlatformProvisioningInput } from "@fluxiq/contracts/platform";
import type { PlatformAccountRecord } from "../../store/index.ts";
import { UNRESOLVED_ACCOUNT_ID } from "../authorization/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import { mailAccountExists, mailWelcomeLink } from "../links/index.ts";
import type { ProvisioningOperation } from "./types.ts";

async function findAccount(context: ProvisioningContext, input: PlatformProvisioningInput<"sendWelcome">): Promise<PlatformAccountRecord | null> {
  return "userId" in input ? context.store.getAccount(input.userId) : context.store.findAccountByEmail(input.email);
}

/**
 * `sendWelcome`, the website's "resend" button: always `accepted`, so the
 * answer says nothing about the address. An active account whose email is
 * not yet verified gets a new welcome link (superseding the last); a verified
 * one gets "you already have an account" instead, since its password is set;
 * an unknown, disabled or deleted one gets nothing.
 */
export const sendWelcomeOperation: ProvisioningOperation<"sendWelcome"> = {
  async target(context, input) {
    if ("userId" in input) return input.userId;
    return (await context.store.findAccountByEmail(input.email))?.userId ?? UNRESOLVED_ACCOUNT_ID;
  },

  async execute(context, input) {
    const account = await findAccount(context, input);
    if (account === null || account.status !== "active") return { status: "accepted" };
    if (account.emailVerifiedAtMs === null) await mailWelcomeLink(context, account, input.continueUrl ?? null);
    else await mailAccountExists(context, account.email);
    return { status: "accepted" };
  }
};
