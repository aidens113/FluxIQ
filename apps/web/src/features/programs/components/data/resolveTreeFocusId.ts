"use client";

export function resolveTreeFocusId(visibleIds: string[], focusedId: string, selectedId?: string): string {
  if (visibleIds.includes(focusedId)) return focusedId;
  if (selectedId && visibleIds.includes(selectedId)) return selectedId;
  return visibleIds[0] ?? "";
}
