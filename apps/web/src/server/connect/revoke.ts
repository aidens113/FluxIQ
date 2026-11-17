import { forgetClientCredential } from "../browser-trust/teardown";

/** A proved ordinary client may end its own trust even after its owner has been disabled. */
export async function revokeConnectCredential(token: string): Promise<void> {
  await forgetClientCredential(token, { hostedOnly: true });
}
