/** What only the host can do for the library. */
export type LibraryHost = {
  /** Fills the chat's composer with `text` and shows Chat, for the person to send or change. */
  askAbout(text: string): void;
  /** Opens the automation that uses a subflow, in the chat. Absent: an automation's name is shown and is not a button. */
  openFlow?(flow: { flowId: string; name: string }): void;
};
