import { FluxIQ } from "fluxiq";
import { existsSync } from "node:fs";
import path from "node:path";

let instance: FluxIQ | null = null;

export function getFluxIQ(): FluxIQ {
  instance ??= FluxIQ.create({ rootDir: process.env.FLUXIQ_ROOT || findWorkspaceRoot(process.cwd()) });
  return instance;
}

function findWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml")) && existsSync(path.join(current, "packages", "fluxiq"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}
