import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('Automation Studio bootstrap architecture', () => {
  it('creates the runtime once and does not subscribe to domain data', () => {
    const hook = read('./useAutomationStudioRuntime.ts');
    expect(hook).toContain('useRef<AutomationStudioRuntime | null>');
    expect(hook).toContain('createAutomationStudioRuntime()');
    expect(hook).not.toMatch(/useSyncExternalStore|useAutomationStoreSelector|useAutomationProjectView/u);
  });
});
