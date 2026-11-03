import type { SupportingRecordingStep } from "./recording-steps.ts";

// Two ways a person takes back a choice without a control that says undo, read
// from the order of the steps alone:
//   - the same opener chosen from again: a button or field opens a list, the
//     person picks an item, and later opens the same list and picks another, so
//     the first pick was replaced;
//   - a return to an earlier choice: the person picks an item, picks a
//     different item of the same kind, then picks the first again, so the
//     different one was a detour.
// The step that replaces or returns carries `undoes`, the number of the first
// step it took back.

const CHOICE_ROLE = /^(link|option|menuitem|menuitemradio|radio|tab)$/;
const OPENER_ROLE = /^(button|combobox)$/;

function live(step: SupportingRecordingStep): boolean {
  return !step.undone && step.undoes === undefined;
}

function take(back: SupportingRecordingStep, by: SupportingRecordingStep, backIndex: number): void {
  back.undone = true;
  if (by.undoes === undefined) by.undoes = backIndex + 1;
}

/** Marks, in place, the choices a later step replaced or returned from. */
export function markReplacedChoices(steps: SupportingRecordingStep[]): void {
  const lastPickByOpener = new Map<string, number>();
  steps.forEach((step, index) => {
    const opener = steps[index - 1];
    if (!step.label || !step.role || !CHOICE_ROLE.test(step.role) || !opener?.label || !opener.role || !OPENER_ROLE.test(opener.role)) return;
    const key = opener.label.toLowerCase();
    const previous = lastPickByOpener.get(key);
    if (previous !== undefined && live(steps[previous]!)) take(steps[previous]!, step, previous);
    lastPickByOpener.set(key, index);
  });
  steps.forEach((step, index) => {
    if (!step.label || !step.role || !CHOICE_ROLE.test(step.role) || !live(step)) return;
    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      const candidate = steps[earlier]!;
      if (candidate.label?.toLowerCase() !== step.label.toLowerCase() || candidate.role !== step.role) continue;
      for (let between = earlier + 1; between < index; between += 1) {
        const detour = steps[between]!;
        if (detour.role === step.role && detour.label !== candidate.label && live(detour)) take(detour, step, between);
      }
      break;
    }
  });
}
