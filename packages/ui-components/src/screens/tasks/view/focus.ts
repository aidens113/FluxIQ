// A redraw replaces what the person may be standing on, so the screen notes which control
// (by its `data-key`) had focus and gives it back to the same one after. Walks `children`
// rather than querying, so it reads the same on a real page and on the tests' fake DOM.

type Keyed = { children: ArrayLike<Keyed>; getAttribute(name: string): string | null; focus(options?: { preventScroll?: boolean }): void; disabled?: boolean; hidden?: boolean };

function find(root: Keyed, key: string): Keyed | undefined {
  for (const child of Array.from(root.children)) {
    if (child.getAttribute("data-key") === key && child.disabled !== true) return child;
    const inner = find(child, key);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/** The `data-key` of the control under `root` that has focus, if any. */
export function focusedKey(root: HTMLElement): string | null {
  const active = (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement;
  if (active === null || active === undefined || root.contains?.(active as Node) !== true) return null;
  const key = (active as { getAttribute?(name: string): string | null }).getAttribute?.("data-key");
  return key ?? null;
}

/** Gives focus to the control with `key` under `root`; false where there is none. */
export function focusKey(root: HTMLElement, key: string): boolean {
  const found = find(root as unknown as Keyed, key);
  if (found === undefined) return false;
  found.focus({ preventScroll: true });
  const field = found as unknown as { value?: string; setSelectionRange?(start: number, end: number): void };
  if (typeof field.value === "string") field.setSelectionRange?.(field.value.length, field.value.length);
  return true;
}
