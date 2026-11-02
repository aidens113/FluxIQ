import type { GateReentryAuthorityInput } from "./input.ts";
import type { GateReentryAssembly } from "./assembly.ts";
import type { GateReentryBinding } from "./binding.ts";
import type { GateReentryPermit } from "./permit.ts";

type Issued = { readonly binding: GateReentryBinding; used: boolean; revoked: boolean };

export function createGateReentryAuthority(input: GateReentryAuthorityInput): GateReentryAssembly {
  if (!capability(input.scope)) throw new Error("gate_reentry.invalid_scope");
  const scope = input.scope;
  const read = input.readCompleted.bind(input);
  const issued = new WeakMap<object, Issued>();
  const byGate = new WeakMap<object, Set<Issued>>();
  const ordinals = new WeakMap<object, Set<number>>();
  let disposed = false;
  return Object.freeze({
    issuer: Object.freeze({
      issue(proof: object): GateReentryPermit | undefined {
        if (disposed || !capability(proof)) return undefined;
        const value = read(proof);
        if (!value || value.scope !== scope || !capability(value.gate)
          || typeof value.requestKey !== "string" || !value.requestKey
          || typeof value.generation !== "string" || !value.generation
          || !Number.isSafeInteger(value.completedOrdinal) || value.completedOrdinal < 1
          || !Number.isSafeInteger(value.remaining) || value.remaining < 1) return undefined;
        const used = ordinals.get(value.gate) ?? new Set<number>();
        if (used.has(value.completedOrdinal)) return undefined;
        const binding = Object.freeze({ scope, gate: value.gate, requestKey: value.requestKey, generation: value.generation, completedOrdinal: value.completedOrdinal, remaining: value.remaining });
        const record: Issued = { binding, used: false, revoked: false };
        const handle = Object.freeze({}) as GateReentryPermit;
        used.add(binding.completedOrdinal);
        ordinals.set(binding.gate, used);
        const records = byGate.get(binding.gate) ?? new Set<Issued>();
        records.add(record);
        byGate.set(binding.gate, records);
        issued.set(handle, record);
        return handle;
      },
      invalidate(gate: object): void {
        for (const record of byGate.get(gate) ?? []) record.revoked = true;
        byGate.delete(gate);
      },
      dispose(): void { disposed = true; }
    }),
    consumer: Object.freeze({
      consume(permit: object, expected: GateReentryBinding): boolean {
        if (disposed || !capability(permit)) return false;
        const record = issued.get(permit);
        if (!record || record.used || record.revoked || !same(record.binding, expected)) return false;
        record.used = true;
        byGate.get(record.binding.gate)?.delete(record);
        return true;
      }
    })
  });
}

function capability(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function same(a: GateReentryBinding, b: GateReentryBinding): boolean {
  return a.scope === b.scope && a.gate === b.gate && a.requestKey === b.requestKey
    && a.generation === b.generation && a.completedOrdinal === b.completedOrdinal && a.remaining === b.remaining;
}
