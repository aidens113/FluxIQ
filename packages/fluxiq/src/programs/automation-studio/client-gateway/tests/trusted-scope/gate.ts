export function recordingScopeGate() {
  let entered!: () => void;
  let release!: () => void;
  const entry = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  return { entered: entry, release, async wait(): Promise<void> {
    entered();
    await held;
  } };
}
