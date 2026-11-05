/** What only the host can do for the library. */
export type LibraryHost = {
  /** Fills the chat's composer with `text` and shows Chat, for the person to send or change. */
  askAbout(text: string): void;
};
