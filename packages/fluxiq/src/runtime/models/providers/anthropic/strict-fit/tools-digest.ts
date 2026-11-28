import { createHash } from "node:crypto";

/** A tool as it is offered, before the wire decides which go strict (`../decision-tools-wire.ts`). */
type Offered = { readonly name: string; readonly description: string; readonly inputSchema: Record<string, unknown> };

/**
 * The digest of one exact offer of tools: every tool's name, description and input schema, in order. The strict set
 * the platform accepted is remembered under it (`./held-fits.ts`), so the same offer is sent as the same bytes for
 * the rest of the process, and a different offer, by one character, starts from its own counted fit.
 */
export function automationStudioAnthropicToolsDigest(tools: readonly Offered[]): string {
  const serialized = JSON.stringify(tools.map((tool) => [tool.name, tool.description, tool.inputSchema]));
  return createHash("sha256").update(serialized).digest("hex");
}
