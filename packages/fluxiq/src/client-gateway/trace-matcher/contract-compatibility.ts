// Whether a trace's recorded contract versions fit the reader (traces and
// offline trials, P4b; source test T14): every contract the reader speaks must
// be recorded at exactly the reader's version. A contract the trace records and
// the reader does not name is not one the reader depends on, so it is ignored.
// Only names and versions are compared; nothing is parsed out of them.

import type { ClientGatewayTraceCompatibility } from "../trace/index.ts";

export function clientGatewayTraceContractCompatibility(recorded: Readonly<Record<string, string>>, current: Readonly<Record<string, string>>): ClientGatewayTraceCompatibility {
  const contracts: { name: string; recordedVersion: string | null; detail: string }[] = [];
  for (const name of Object.keys(current).sort()) {
    const version = current[name];
    const recordedVersion = Object.hasOwn(recorded, name) ? recorded[name] : undefined;
    if (recordedVersion === version) continue;
    const detail = recordedVersion === undefined ? `the trace records no ${name} version; this reader speaks ${version}` : `recorded ${recordedVersion}; this reader speaks ${version}`;
    contracts.push({ name, recordedVersion: recordedVersion ?? null, detail });
  }
  return contracts.length === 0 ? { status: "compatible" } : { status: "incompatible", contracts };
}
