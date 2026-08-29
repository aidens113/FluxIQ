"use client";

import { useCallback, useRef, useState } from "react";
import type { OverlayCommandStatus } from "./contracts";

export type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Entry)[]
    ? readonly DeepReadonly<Entry>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type OverlayCommandDispatcher<Command> = (
  command: DeepReadonly<Command>
) => Promise<void>;

export type AtomicOverlayCommandGate<Command> = {
  execute(command: Command): Promise<boolean>;
  pending(): boolean;
};

export function immutableOverlayCommandSnapshot<Command>(command: Command): DeepReadonly<Command> {
  return immutableSnapshot(command, new WeakMap<object, unknown>()) as DeepReadonly<Command>;
}

function immutableSnapshot(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== "object") return value;
  const cached = seen.get(value);
  if (cached) return cached;
  if (value instanceof Date) return Object.freeze(new Date(value.getTime()));

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const entry of value) clone.push(immutableSnapshot(entry, seen));
    return Object.freeze(clone);
  }

  const clone: Record<PropertyKey, unknown> = {};
  seen.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    clone[key] = immutableSnapshot(Reflect.get(value, key), seen);
  }
  return Object.freeze(clone);
}

export function createAtomicOverlayCommandGate<Command>(
  dispatch: OverlayCommandDispatcher<Command>,
  onStatus?: (status: OverlayCommandStatus) => void
): AtomicOverlayCommandGate<Command> {
  let inFlight = false;
  return {
    pending: () => inFlight,
    async execute(command) {
      if (inFlight) return false;
      inFlight = true;
      onStatus?.({ pending: true, error: null });
      try {
        await dispatch(immutableOverlayCommandSnapshot(command));
        onStatus?.({ pending: false, error: null });
        return true;
      } catch (error) {
        onStatus?.({
          pending: false,
          error: error instanceof Error ? error.message : "The command could not be completed."
        });
        return false;
      } finally {
        inFlight = false;
      }
    }
  };
}

export function useAtomicOverlayCommand<Command>(dispatch: OverlayCommandDispatcher<Command>) {
  const [status, setStatus] = useState<OverlayCommandStatus>({ pending: false, error: null });
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const gateRef = useRef<AtomicOverlayCommandGate<Command> | null>(null);
  if (!gateRef.current) {
    gateRef.current = createAtomicOverlayCommandGate(
      (command) => dispatchRef.current(command),
      setStatus
    );
  }
  const execute = useCallback((command: Command) => gateRef.current!.execute(command), []);
  return { execute, status };
}
