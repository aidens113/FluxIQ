import path from "node:path";

/**
 * Where a data root's owner file lives: beside its state directory, `<root>/.fluxiq.owner`.
 * It cannot live inside `.fluxiq`: any entry there makes a fresh root look like legacy storage
 * (`inspectFluxIQStorage`). Living in the root itself, it is found under every spelling of the
 * root's path, so two processes naming one directory differently still meet.
 */
export function fluxIQDataRootOwnerFile(rootDir: string, fluxiqDir: string = process.env.FLUXIQ_DIR?.trim() || ".fluxiq"): string {
  const stateDir = path.resolve(rootDir, fluxiqDir);
  return path.join(path.dirname(stateDir), `${path.basename(stateDir)}.owner`);
}
