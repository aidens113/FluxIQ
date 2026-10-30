import path from "node:path";

/** Where the owner claim keeps its files, under `<fluxiq>/security/`: the claimed marker and the generated setup code. */
export function ownerClaimPaths(fluxiqDir: string): { securityDir: string; marker: string; generatedCode: string } {
  const securityDir = path.join(fluxiqDir, "security");
  return { securityDir, marker: path.join(securityDir, "owner-claim.json"), generatedCode: path.join(securityDir, "setup-code") };
}
