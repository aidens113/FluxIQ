import { vi } from "vitest";
import { registry, resetRouteRuntime, runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";

function operations() {
  return { ioSnapshot: vi.fn(), validateDomainIo: vi.fn(), validateIoRequirements: vi.fn() };
}

export const io = { primary: operations(), a: operations(), b: operations() };

export async function resetIoRuntime() {
  await resetRouteRuntime();
  for (const [label, instance, methods] of [["primary", runtime.primary, io.primary], ["A", runtime.tenantA, io.a], ["B", runtime.tenantB, io.b]] as const) {
    Object.assign(instance, methods);
    methods.ioSnapshot.mockReturnValue({ inputs: [{ id: "same-input", title: `Tenant ${label}` }], outputs: [] });
    methods.validateDomainIo.mockReturnValue([]);
    methods.validateIoRequirements.mockReturnValue([]);
  }
}

export function localTenantIo(profile: "local" | "self-hosted" = "local") {
  runtime.tenantA.programs.api = registry("tenant-a", profile);
  runtime.tenantB.programs.api = registry("tenant-b", profile);
}
