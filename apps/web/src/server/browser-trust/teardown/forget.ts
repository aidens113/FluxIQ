import { assertCredentialTeardownCurrent } from "./current";
import { forgetHostedCredential } from "./hosted";
import { holdCredentialTeardownRuntime } from "./runtime";

async function perform(token: string, hostedOnly: boolean): Promise<boolean> {
  const runtime = await holdCredentialTeardownRuntime();
  try {
    assertCredentialTeardownCurrent(runtime);
    if (runtime.manager.tenancy === "multi") return await forgetHostedCredential(runtime, token);
    if (hostedOnly) throw new Error("Hosted connect is not enabled for this deployment.");
    const gateway = runtime.primary.programs.clientGateway;
    await gateway.ready();
    assertCredentialTeardownCurrent(runtime);
    const result = await gateway.access.forgetByCredential(token);
    if (typeof result !== "boolean") throw new Error("Credential teardown result is invalid.");
    return result;
  } finally {
    runtime.release();
  }
}

/** Result-bearing credential-only cleanup; no cookie fallback, live account check or content authority. */
export async function forgetClientCredential(token: string, options: { hostedOnly?: boolean } = {}): Promise<boolean> {
  try {
    return await perform(token, options.hostedOnly === true);
  } catch {
    throw new Error("Client trust could not be removed. Please try again.");
  }
}
