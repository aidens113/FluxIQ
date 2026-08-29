export type AutomationHierarchyKeyboardItem = {
  id: string;
  parentId: string | null;
  expanded: boolean | null;
};

export type AutomationHierarchyKeyboardAction =
  | { type: "focus"; id: string }
  | { type: "toggle"; id: string }
  | { type: "open"; id: string }
  | { type: "none" };

export function automationHierarchyKeyboardAction(input: {
  items: readonly AutomationHierarchyKeyboardItem[];
  currentId: string;
  key: string;
}): AutomationHierarchyKeyboardAction {
  const index = input.items.findIndex((item) => item.id === input.currentId);
  if (index < 0) return { type: "none" };
  const item = input.items[index]!;
  const focus = (candidate: AutomationHierarchyKeyboardItem | undefined): AutomationHierarchyKeyboardAction =>
    candidate ? { type: "focus", id: candidate.id } : { type: "none" };

  if (input.key === "ArrowDown") return focus(input.items[index + 1] ?? input.items[0]);
  if (input.key === "ArrowUp") return focus(input.items[index - 1] ?? input.items[input.items.length - 1]);
  if (input.key === "Home") return focus(input.items[0]);
  if (input.key === "End") return focus(input.items[input.items.length - 1]);
  if (input.key === "ArrowRight") {
    if (item.expanded === false) return { type: "toggle", id: item.id };
    return focus(input.items[index + 1]?.parentId === item.id ? input.items[index + 1] : undefined);
  }
  if (input.key === "ArrowLeft") {
    if (item.expanded === true) return { type: "toggle", id: item.id };
    return focus(input.items.find((candidate) => candidate.id === item.parentId));
  }
  if (input.key === "Enter" || input.key === " ") return { type: "open", id: item.id };
  return { type: "none" };
}