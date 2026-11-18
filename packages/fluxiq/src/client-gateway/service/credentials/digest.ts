import { createHash } from "node:crypto";

/** The existing durable credential digest; raw credentials never enter a store. */
export function clientGatewayCredentialHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
