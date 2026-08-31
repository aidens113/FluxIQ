import { describe, expect, it } from 'vitest';
import { createAutomationStudioRuntime } from './studio-runtime';

describe('Automation Studio runtime', () => {
  it('creates all presentation and domain owners once', () => {
    const runtime = createAutomationStudioRuntime();
    const owners = runtime.owners;

    expect(runtime.owners).toBe(owners);
    expect(runtime.owners.studioStores).toBe(owners.studioStores);
    expect(runtime.owners.studioUiStore).toBe(owners.studioUiStore);
    expect(runtime.owners.workspaceRenderStore).toBe(owners.workspaceRenderStore);
  });

  it('rejects stale project generations and invalidates work on dispose', () => {
    const runtime = createAutomationStudioRuntime();
    const first = runtime.projectGeneration.advance();
    const second = runtime.projectGeneration.advance();

    expect(runtime.projectGeneration.isCurrent(first)).toBe(false);
    expect(runtime.projectGeneration.isCurrent(second)).toBe(true);
    runtime.dispose();
    expect(runtime.projectGeneration.isCurrent(second)).toBe(false);
  });
});
