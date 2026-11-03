/** What the launcher says it will do, and what is waiting behind it. */
export function conversationLauncherLabel(open: boolean, waiting: number): string {
  const state = open ? "Collapse the FluxIQ conversation" : "Open the FluxIQ conversation";
  if (waiting === 1) return `${state} - 1 thread is waiting on your answer`;
  if (waiting > 1) return `${state} - ${waiting} threads are waiting on your answer`;
  return state;
}
