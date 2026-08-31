'use client';

import { useEffect, useRef } from 'react';
import { createAutomationStudioRuntime, type AutomationStudioRuntime } from './studio-runtime';

export function useAutomationStudioRuntime(): AutomationStudioRuntime {
  const runtimeRef = useRef<AutomationStudioRuntime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = createAutomationStudioRuntime();
  useEffect(() => () => runtimeRef.current?.dispose(), []);
  return runtimeRef.current;
}
