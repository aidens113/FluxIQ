// The composer's recording attachment: a button beside Send that lists the
// project's finished, described recordings, and the chip that shows the one
// chosen. One recording per message. The list is read from the transport's
// `recordings.list` each time it opens; nothing is cached.

import { createElement } from "../../dom/index.ts";
import type { ChatRecordingsPort } from "../ports/index.ts";
import { attachableRecordings, type AttachableRecording } from "./attachable-recordings.ts";

export const ATTACH_LABEL = "Attach a recording";
export const REMOVE_LABEL = "Remove attached recording";
export const NO_RECORDINGS = "No finished recordings yet. Press Start recording, describe what you will show, then stop.";
const LIST_FAILED = "Couldn't read your recordings. Try again.";
/** Core lists the whole domain newest first; this many covers a project's ten after the others are dropped. */
const LIST_SIZE = 100;

export type RecordingAttachment = {
  /** The paperclip button beside Send. */
  readonly button: HTMLElement;
  /** The list the button opens. */
  readonly menu: HTMLElement;
  /** The chip naming the attached recording. */
  readonly chip: HTMLElement;
  /** The attached recording, when it belongs to the project the chat is in. */
  current(): { readonly id: string; readonly label: string } | undefined;
  /** Drops the attached recording. */
  clear(): void;
  /** Attaches the newest finished, described recording of the project; answers whether there was one. */
  attachLatest(): Promise<boolean>;
  setDisabled(disabled: boolean): void;
  /** Hides the chip when the chat has moved to another project than the recording's. */
  refresh(): void;
};

export function createRecordingAttachment(recordings: ChatRecordingsPort, projectId: () => string | undefined): RecordingAttachment {
  const button = createElement("button", { id: "conversationAttachButton", className: "composer-attach", text: "+", attrs: { type: "button", "aria-label": ATTACH_LABEL, title: ATTACH_LABEL, "aria-expanded": "false" } });
  const menu = createElement("div", { className: "composer-attach-menu", hidden: true, attrs: { role: "group", "aria-label": ATTACH_LABEL } });
  const chipText = createElement("span", { className: "composer-chip-text" });
  const remove = createElement("button", { className: "composer-chip-remove", text: "×", attrs: { type: "button", "aria-label": REMOVE_LABEL, title: REMOVE_LABEL } });
  const chip = createElement("div", { className: "composer-chip", hidden: true }, [chipText, remove]);
  let attached: (AttachableRecording & { projectId: string | undefined }) | undefined;
  let reading = 0;

  function show(): void {
    const own = current();
    chip.hidden = own === undefined;
    chipText.textContent = own === undefined ? "" : `Recording: ${own.label}`;
    // The chip cuts a long description short; its whole text shows on hover.
    chipText.title = chipText.textContent;
  }
  function current(): AttachableRecording | undefined {
    return attached !== undefined && attached.projectId === projectId() ? { id: attached.id, label: attached.label } : undefined;
  }
  function attach(recording: AttachableRecording): void {
    attached = { ...recording, projectId: projectId() };
    close();
    show();
  }
  function note(text: string): HTMLElement {
    return createElement("p", { className: "composer-attach-note", text, attrs: { role: "status" } });
  }
  function close(): void {
    reading += 1;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
  async function read(): Promise<{ list: AttachableRecording[] } | { failed: true }> {
    const result = await recordings.list({ page: 1, pageSize: LIST_SIZE });
    if (!result.ok) {
      return { failed: true };
    }
    return { list: attachableRecordings(result.value.items ?? [], projectId()) };
  }

  button.addEventListener("click", () => {
    if (!menu.hidden) {
      close();
      return;
    }
    const mine = ++reading;
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    menu.replaceChildren(createElement("h3", { className: "composer-attach-heading", text: ATTACH_LABEL }));
    void read().then((outcome) => {
      if (mine !== reading) return;
      const heading = createElement("h3", { className: "composer-attach-heading", text: ATTACH_LABEL });
      const failed = "failed" in outcome;
      if (failed || outcome.list.length === 0) {
        menu.replaceChildren(heading, note(failed ? LIST_FAILED : NO_RECORDINGS));
        return;
      }
      menu.replaceChildren(heading, ...outcome.list.map((recording) => {
        const item = createElement("button", { className: "composer-attach-item", text: recording.label, attrs: { type: "button" } });
        item.addEventListener("click", () => attach(recording));
        return item;
      }));
    });
  });
  function drop(): void {
    attached = undefined;
    show();
  }
  remove.addEventListener("click", drop);

  return {
    button, menu, chip,
    current,
    clear: drop,
    refresh: show,
    async attachLatest() {
      const outcome = await read();
      if ("failed" in outcome || outcome.list[0] === undefined) return false;
      attach(outcome.list[0]);
      return true;
    },
    setDisabled(disabled) {
      (button as HTMLButtonElement).disabled = disabled;
      (remove as HTMLButtonElement).disabled = disabled;
    }
  };
}
