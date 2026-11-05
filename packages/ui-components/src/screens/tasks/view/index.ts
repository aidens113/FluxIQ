// The tasks screen drawn: the list, an open task, and the pieces of it. Each view is a function
// of the screen's state and the callbacks it is given; none holds state of its own.
export { attemptsView, type AttemptsHost } from "./attempts.ts";
export { taskButton, type TaskButtonOptions } from "./button.ts";
export { confirmDeleteView, type ConfirmDeleteHost } from "./confirm-delete.ts";
export { detailsView, type DetailsHost } from "./details.ts";
export { focusedKey, focusKey } from "./focus.ts";
export { keepView } from "./keep-view.ts";
export { listView, type ListHost } from "./list.ts";
export { rowView } from "./row.ts";
export type { DeleteState, DetailsState, ListState, RenameState, StepsState } from "./state.ts";
export { stepsView, type StepsHost } from "./steps.ts";
export { titleView, type TitleHost } from "./title.ts";
