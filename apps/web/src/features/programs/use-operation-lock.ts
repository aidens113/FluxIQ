"use client";

import { createContext, createElement, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const OperationBusyContext = createContext(false);

export function OperationBusyBoundary(props: { busy: boolean; children: ReactNode }) {
  return createElement(OperationBusyContext.Provider, { value: props.busy }, props.children);
}

export function useInheritedOperationBusy(): boolean {
  return useContext(OperationBusyContext);
}

export class OperationGate {
  activeOperation: string | null = null;

  async run<T>(operation: string, task: () => Promise<T>, onChange?: (operation: string | null) => void): Promise<T | undefined> {
    if (this.activeOperation) return undefined;
    this.activeOperation = operation;
    onChange?.(operation);
    try {
      return await task();
    } finally {
      if (this.activeOperation === operation) this.activeOperation = null;
      onChange?.(this.activeOperation);
    }
  }
}

export function useOperationLock() {
  const gateRef = useRef(new OperationGate());
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const run = useCallback(<T,>(operation: string, task: () => Promise<T>): Promise<T | undefined> => gateRef.current.run(operation, task, setActiveOperation), []);
  return { activeOperation, busy: activeOperation !== null, run };
}
